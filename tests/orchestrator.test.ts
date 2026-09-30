/**
 * Approve is idempotent: a second call must not create another calendar event
 * or send another invitation. Sheets, Calendar and Resend are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: {} as Record<string, string>,
  events: 0,
  invites: 0,
  rejections: 0,
}));

vi.mock("@/lib/sheets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sheets")>();
  return {
    ...actual,
    getCandidate: vi.fn(async () => ({ ...state.row })),
    updateCandidate: vi.fn(async (_id: string, patch: Record<string, string>) => {
      Object.assign(state.row, patch);
    }),
    getJob: vi.fn(async () => ({
      job_id: "ai-engineer",
      title_fa: "مهندس هوش مصنوعی",
      description_fa: "…",
      min_score: 70,
      is_open: true,
    })),
    listCandidates: vi.fn(async () => [{ ...state.row }]),
    appendLog: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/calendar", () => ({
  getBusy: vi.fn(async () => []),
  isSlotFree: vi.fn(async () => true),
  createInterviewEvent: vi.fn(async () => {
    state.events += 1;
    return { id: "evt-1", iCalUID: "evt-1@google.com" };
  }),
  getEventIcalUid: vi.fn(async () => "evt-1@google.com"),
}));

vi.mock("@/lib/email", () => ({
  sendInvitation: vi.fn(async () => {
    state.invites += 1;
    return { status: "sent" as const };
  }),
  sendRejection: vi.fn(async () => {
    state.rejections += 1;
    return { status: "skipped" as const };
  }),
  sendReceipt: vi.fn(async () => ({ status: "skipped" as const })),
}));

import { approveCandidate, declineCandidate } from "@/lib/orchestrator";
import { createInterviewEvent } from "@/lib/calendar";
import { sendInvitation } from "@/lib/email";

function blankRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    id: "c1",
    full_name: "سارا محمدی",
    email: "sara@example.com",
    phone: "09120000000",
    job_id: "ai-engineer",
    resume_path: "",
    original_filename: "",
    resume_text: "رزومه",
    status: "candidate",
    score: "80",
    rationale_fa: "مناسب است.",
    matched_skills: "",
    missing_requirements: "",
    manager_note: "",
    interview_start: "",
    interview_end: "",
    calendar_event_id: "",
    invite_email_status: "",
    rejection_email_status: "",
    receipt_email_status: "",
    error: "",
    consent_at: "",
    created_at: "2026-10-01T08:00:00.000Z",
    updated_at: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  state.row = blankRow();
  state.events = 0;
  state.invites = 0;
  state.rejections = 0;
  vi.mocked(createInterviewEvent).mockClear();
  vi.mocked(sendInvitation).mockClear();
});

describe("approve idempotency", () => {
  it("creates one event and sends one invitation", async () => {
    const saved = await approveCandidate("c1", "وقت دارم");
    expect(saved.status).toBe("scheduled");
    expect(saved.calendar_event_id).toBe("evt-1");
    expect(saved.interview_start).not.toBe("");
    expect(saved.manager_note).toBe("وقت دارم");
    expect(saved.invite_email_status).toBe("sent");
    expect(state.events).toBe(1);
    expect(state.invites).toBe(1);
  });

  it("does not create a second event or resend when approve runs again", async () => {
    await approveCandidate("c1");
    const again = await approveCandidate("c1");
    expect(again.status).toBe("scheduled");
    expect(state.events).toBe(1);
    expect(state.invites).toBe(1);
    expect(createInterviewEvent).toHaveBeenCalledTimes(1);
  });

  it("skips event creation when a calendar event id is already stored", async () => {
    state.row = blankRow({
      calendar_event_id: "evt-existing",
      interview_start: "2026-10-12T08:30:00.000Z",
      interview_end: "2026-10-12T09:15:00.000Z",
    });
    const saved = await approveCandidate("c1");
    expect(saved.status).toBe("scheduled");
    expect(saved.calendar_event_id).toBe("evt-existing");
    expect(state.events).toBe(0);
    expect(state.invites).toBe(1);
  });
});

describe("decline", () => {
  it("does not record an email when rejection emails are skipped", async () => {
    const saved = await declineCandidate("c1");
    expect(saved.status).toBe("declined");
    expect(saved.rejection_email_status).toBe("");
    expect(state.rejections).toBe(1);
  });
});
