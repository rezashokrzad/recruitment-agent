/**
 * Orchestrator: the only place that moves a candidate along the status machine.
 *
 * Every step reads the row, checks `canTransition`, writes the new status
 * together with its fields, and appends a line to the `log` tab. Steps are
 * idempotent: running one twice does not create a second calendar event or
 * send a second email.
 *
 * Approvals run one at a time through `approvalQueue` so two managers cannot
 * grab the same interview slot.
 */
import { DateTime } from "luxon";
import { screenResume } from "./agents/screening";
import { createInterviewEvent, getBusy, getEventIcalUid, isSlotFree } from "./calendar";
import { getEnv } from "./env";
import { sendInvitation, sendReceipt, sendRejection, type EmailSendResult } from "./email";
import { approvalQueue } from "./queue";
import { findFirstSlot, type SchedulerConfig, type Slot } from "./scheduler";
import {
  appendLog,
  getCandidate,
  getJob,
  joinList,
  listCandidates,
  updateCandidate,
  type Candidate,
  type LogActor,
} from "./sheets";
import {
  canTransition,
  isSchedulingFailure,
  isStatus,
  SCHEDULING_ERROR_PREFIX,
  SCREENING_ERROR_PREFIX,
  STATUS_LABEL_FA,
  type Status,
} from "./status";

const STUCK_MS = 10 * 60 * 1000;

export class OrchestratorError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "OrchestratorError";
    this.status = status;
  }
}

export type ScreenOutcome = {
  id: string;
  full_name: string;
  status: Status;
  score: string;
};

async function mustGet(id: string): Promise<Candidate> {
  const row = await getCandidate(id);
  if (!row) throw new OrchestratorError("متقاضی پیدا نشد.", 404);
  return row;
}

function stuck(updatedAt: string, now = Date.now()): boolean {
  const t = Date.parse(updatedAt);
  return Number.isFinite(t) && now - t > STUCK_MS;
}

/**
 * Move `id` from `from` to `to`, writing `patch` in the same sheet update.
 * Re-reads the row immediately before the write so a concurrent change is refused.
 * If the row is already at `to`, returns it unchanged (idempotent).
 */
export async function transition(
  id: string,
  from: Status | readonly Status[],
  to: Status,
  actor: LogActor,
  details: string,
  patch: Partial<Candidate> = {},
): Promise<Candidate> {
  const expected = new Set<Status>(typeof from === "string" ? [from] : from);
  const current = await mustGet(id);
  const status = current.status as Status;

  if (status === to) return current;
  if (!isStatus(status) || !expected.has(status) || !canTransition(status, to)) {
    const fromLabel = STATUS_LABEL_FA[status] ?? status;
    const toLabel = STATUS_LABEL_FA[to] ?? to;
    throw new OrchestratorError(`تغییر وضعیت از «${fromLabel}» به «${toLabel}» مجاز نیست.`);
  }

  const fresh = await mustGet(id);
  if (fresh.status !== status) {
    throw new OrchestratorError("وضعیت متقاضی هم‌زمان تغییر کرده است. صفحه را به‌روز کنید.");
  }

  const write: Partial<Candidate> = { ...patch, status: to };
  if (to !== "error" && patch.error === undefined) write.error = "";

  await updateCandidate(id, write);
  await appendLog([
    {
      candidate_id: id,
      from_status: status,
      to_status: to,
      actor,
      details: details.replace(/\s+/g, " ").trim().slice(0, 500),
    },
  ]).catch((err) => console.error("[orchestrator] log append failed:", err));

  return mustGet(id);
}

function notePatch(note: string | undefined): Partial<Candidate> {
  return note === undefined ? {} : { manager_note: note };
}

// ─────────────────────────── Screening ───────────────────────────

function needsScreening(row: Candidate, now = Date.now()): boolean {
  return row.status === "new" || (row.status === "screening" && stuck(row.updated_at, now));
}

/** Screen one candidate. Already-screened rows are returned as they are. */
export async function screenCandidate(id: string): Promise<ScreenOutcome> {
  let row = await mustGet(id);

  if (row.status === "screening" && stuck(row.updated_at)) {
    row = await transition(id, "screening", "new", "system", "stuck in screening for over 10 minutes");
  }

  if (row.status === "candidate" || row.status === "rejected") {
    return { id, full_name: row.full_name, status: row.status, score: row.score };
  }
  if (row.status === "screening") {
    return { id, full_name: row.full_name, status: "screening", score: row.score };
  }
  if (row.status !== "new") {
    throw new OrchestratorError("فقط رزومه‌های جدید غربالگری می‌شوند.");
  }

  const job = await getJob(row.job_id);
  await transition(id, "new", "screening", "agent", "screening started");

  try {
    if (!job) throw new Error("موقعیت شغلی پیدا نشد.");
    if (row.resume_text.trim().length < 40) throw new Error("متن رزومه برای غربالگری کافی نیست.");

    const result = await screenResume(row.resume_text, job);
    const to: Status = result.decision === "candidate" ? "candidate" : "rejected";
    const saved = await transition(id, "screening", to, "agent", `score ${result.score} / min ${job.min_score}`, {
      score: String(result.score),
      rationale_fa: result.rationale_fa,
      matched_skills: joinList(result.matched_skills),
      missing_requirements: joinList(result.missing_requirements),
      error: "",
    });
    return { id, full_name: saved.full_name, status: to, score: saved.score };
  } catch (err) {
    const message = (err as Error).message || "خطای ناشناخته";
    const saved = await transition(id, "screening", "error", "agent", message, {
      error: `${SCREENING_ERROR_PREFIX}${message}`.slice(0, 500),
    });
    return { id, full_name: saved.full_name, status: "error", score: saved.score };
  }
}

/** Every `new` row, plus any row stuck in `screening` for more than 10 minutes. */
export async function screenAllNew(): Promise<{
  total: number;
  candidate: number;
  rejected: number;
  error: number;
}> {
  const pending = (await listCandidates()).filter((row) => needsScreening(row));
  const counts = { total: pending.length, candidate: 0, rejected: 0, error: 0 };
  for (const row of pending) {
    const outcome = await screenCandidate(row.id);
    if (outcome.status === "candidate" || outcome.status === "rejected" || outcome.status === "error") {
      counts[outcome.status] += 1;
    }
  }
  return counts;
}

/**
 * Screen the next pending row only. The admin button calls this in a loop
 * so the UI can show who is being screened and how many remain.
 */
export async function screenNext(): Promise<{ processed: ScreenOutcome | null; remaining: number }> {
  const pending = (await listCandidates()).filter((row) => needsScreening(row));
  const next = pending[0];
  if (!next) return { processed: null, remaining: 0 };
  const processed = await screenCandidate(next.id);
  const remaining = (await listCandidates()).filter((row) => needsScreening(row)).length;
  return { processed, remaining };
}

// ─────────────────────────── Scheduling ───────────────────────────

function slotConfig(): SchedulerConfig {
  const env = getEnv();
  return {
    timezone: env.MANAGER_TIMEZONE,
    stepMinutes: env.SLOT_STEP_MINUTES,
    minLeadHours: env.MIN_LEAD_HOURS,
    searchWeeks: env.SEARCH_WEEKS,
  };
}

async function recordEmail(
  id: string,
  field: "invite_email_status" | "rejection_email_status" | "receipt_email_status",
  result: EmailSendResult,
  details: string,
): Promise<void> {
  if (result.status === "skipped") return;
  const value = result.status === "sent" ? "sent" : `failed: ${result.error}`.slice(0, 500);
  await updateCandidate(id, { [field]: value });
  await appendLog([
    { candidate_id: id, from_status: "", to_status: "", actor: "system", details: `${details}: ${value}` },
  ]).catch((err) => console.error("[orchestrator] email log failed:", err));
}

/** Send the invitation once. A row already marked `sent` is left alone. */
async function deliverInvitation(row: Candidate, iCalUID?: string): Promise<void> {
  if (row.invite_email_status === "sent") return;
  if (!row.calendar_event_id || !row.interview_start || !row.interview_end) return;

  const job = await getJob(row.job_id);
  let uid = iCalUID;
  if (!uid) {
    try {
      uid = await getEventIcalUid(row.calendar_event_id);
    } catch (err) {
      await recordEmail(row.id, "invite_email_status", { status: "failed", error: (err as Error).message }, "invitation");
      return;
    }
  }

  const result = await sendInvitation({
    to: row.email,
    fullName: row.full_name,
    position: job?.title_fa ?? row.job_id,
    start: DateTime.fromISO(row.interview_start, { setZone: true }),
    end: DateTime.fromISO(row.interview_end, { setZone: true }),
    iCalUID: uid,
  });
  await recordEmail(row.id, "invite_email_status", result, "invitation");
}

/**
 * Search, re-check the chosen slot, create the event. Must run inside
 * `approvalQueue` (callers enqueue; this function does not, so it cannot
 * deadlock waiting on its own queue).
 */
async function scheduleUnlocked(id: string): Promise<Candidate> {
  let row = await mustGet(id);

  if (row.calendar_event_id) {
    // approved → scheduling → scheduled. There is no direct edge, and we must
    // not create a second event once an id is already stored.
    if (row.status === "approved") {
      row = await transition(id, "approved", "scheduling", "system", "calendar event already exists");
    }
    if (row.status === "scheduling") {
      row = await transition(id, "scheduling", "scheduled", "system", "calendar event already exists");
    }
    await deliverInvitation(row);
    return mustGet(id);
  }

  if (row.status === "approved") {
    row = await transition(id, "approved", "scheduling", "system", "searching for a free slot");
  }
  if (row.status !== "scheduling") {
    throw new OrchestratorError("زمان‌بندی فقط از وضعیت تاییدشده شروع می‌شود.");
  }

  const config = slotConfig();
  const now = DateTime.now();
  const earliest = now.setZone(config.timezone).plus({ hours: config.minLeadHours });
  const horizonEnd = earliest.plus({ weeks: config.searchWeeks });

  let busy;
  try {
    busy = await getBusy(earliest.minus({ hours: 1 }), horizonEnd.plus({ days: 1 }));
  } catch (err) {
    return failScheduling(id, (err as Error).message);
  }

  const tried = new Set<string>();
  let slot: Slot | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    slot = findFirstSlot(busy, now, config);
    if (!slot) break;
    const key = String(slot.start.toMillis());
    if (tried.has(key)) {
      busy = [...busy, slot];
      continue;
    }
    tried.add(key);

    let free = false;
    try {
      free = await isSlotFree(slot.start, slot.end);
    } catch (err) {
      return failScheduling(id, (err as Error).message);
    }
    if (!free) {
      busy = [...busy, slot];
      slot = null;
      continue;
    }
    break;
  }

  if (!slot) {
    return transition(id, "scheduling", "no_slot", "system", "no free slot inside the search horizon");
  }

  const job = await getJob(row.job_id);
  try {
    const event = await createInterviewEvent({
      fullName: row.full_name,
      jobTitle: job?.title_fa ?? row.job_id,
      email: row.email,
      phone: row.phone,
      score: row.score,
      rationale: row.rationale_fa,
      start: slot.start,
      end: slot.end,
    });
    row = await transition(id, "scheduling", "scheduled", "system", `event ${event.id}`, {
      interview_start: slot.start.toUTC().toISO() ?? "",
      interview_end: slot.end.toUTC().toISO() ?? "",
      calendar_event_id: event.id,
      error: "",
    });
    await deliverInvitation(row, event.iCalUID);
    return mustGet(id);
  } catch (err) {
    return failScheduling(id, (err as Error).message);
  }
}

async function failScheduling(id: string, message: string): Promise<Candidate> {
  const text = message || "خطای ناشناخته در زمان‌بندی";
  return transition(id, "scheduling", "error", "system", text, {
    error: `${SCHEDULING_ERROR_PREFIX}${text}`.slice(0, 500),
  });
}

export async function approveCandidate(id: string, managerNote?: string): Promise<Candidate> {
  return approvalQueue(() => approveUnlocked(id, managerNote));
}

async function approveUnlocked(id: string, managerNote?: string): Promise<Candidate> {
  const row = await mustGet(id);

  if (row.status === "scheduled") {
    await deliverInvitation(row);
    return mustGet(id);
  }
  if (row.status === "approved" || row.status === "scheduling") {
    if (managerNote !== undefined) await updateCandidate(id, { manager_note: managerNote });
    return scheduleUnlocked(id);
  }
  if (row.status !== "candidate") {
    throw new OrchestratorError("فقط متقاضی «در انتظار تایید» را می‌توان تایید کرد.");
  }

  await transition(id, "candidate", "approved", "manager", managerNote || "approved", notePatch(managerNote));
  return scheduleUnlocked(id);
}

export async function declineCandidate(id: string, managerNote?: string): Promise<Candidate> {
  const row = await mustGet(id);
  const from = row.status as Status;
  if (from !== "candidate" && from !== "unreadable" && from !== "rejected") {
    throw new OrchestratorError("این متقاضی در وضعیتی نیست که بتوان رد کرد.");
  }

  const saved = await transition(id, from, "declined", "manager", "declined by manager", notePatch(managerNote));
  await deliverRejection(saved);
  return mustGet(id);
}

/** Rejection email only after the manager confirms. The AI's "rejected" never sends one. */
async function deliverRejection(row: Candidate): Promise<void> {
  if (row.rejection_email_status === "sent") return;
  const job = await getJob(row.job_id);
  const result = await sendRejection({
    to: row.email,
    fullName: row.full_name,
    position: job?.title_fa ?? row.job_id,
  });
  await recordEmail(row.id, "rejection_email_status", result, "rejection");
}

/** Manager override: rejected or unreadable → candidate. No email. */
export async function overrideCandidate(id: string, managerNote?: string): Promise<Candidate> {
  const row = await mustGet(id);
  const from = row.status as Status;
  if (from !== "rejected" && from !== "unreadable") {
    throw new OrchestratorError("فقط «رد پیشنهادی» یا «ناخوانا» را می‌توان به کاندید برگرداند.");
  }
  return transition(id, from, "candidate", "manager", "override to candidate", notePatch(managerNote));
}

/**
 * «تلاش مجدد»:
 *   • screening error → new, then screen again
 *   • scheduling error or no_slot (or a row stuck in approved / scheduling) → schedule again
 */
export async function retryCandidate(id: string, managerNote?: string): Promise<Candidate> {
  const row = await mustGet(id);
  if (managerNote !== undefined && row.manager_note !== managerNote) {
    await updateCandidate(id, { manager_note: managerNote });
  }

  if (row.status === "error" && !isSchedulingFailure(row.error)) {
    await transition(id, "error", "new", "manager", "retry screening", { error: "" });
    await screenCandidate(id);
    return mustGet(id);
  }

  if (
    row.status === "no_slot" ||
    row.status === "approved" ||
    row.status === "scheduling" ||
    (row.status === "error" && isSchedulingFailure(row.error))
  ) {
    return approvalQueue(async () => {
      const fresh = await mustGet(id);
      if (fresh.status === "no_slot") {
        await transition(id, "no_slot", "approved", "manager", "retry scheduling");
      } else if (fresh.status === "error") {
        await transition(id, "error", "approved", "manager", "retry scheduling", { error: "" });
      } else if (fresh.status !== "approved" && fresh.status !== "scheduling" && fresh.status !== "scheduled") {
        throw new OrchestratorError("تلاش مجدد برای این وضعیت ممکن نیست.");
      }
      return scheduleUnlocked(id);
    });
  }

  throw new OrchestratorError("تلاش مجدد فقط برای خطا یا نبودن زمان خالی است.");
}

/** Receipt after a successful upload. No-op when the flag is off or it was already sent. */
export async function sendReceiptForCandidate(id: string): Promise<void> {
  if (!getEnv().SEND_RECEIPT_EMAILS) return;
  const row = await getCandidate(id);
  if (!row || row.receipt_email_status === "sent") return;
  const job = await getJob(row.job_id);
  const result = await sendReceipt({
    to: row.email,
    fullName: row.full_name,
    jobTitle: job?.title_fa ?? row.job_id,
  });
  await recordEmail(id, "receipt_email_status", result, "receipt");
}
