/**
 * The candidate status machine.
 *
 * The `status` column in the sheet is the single source of truth for where a
 * candidate is in the pipeline. The orchestrator only moves a candidate along
 * an edge listed in `TRANSITIONS`; anything else is a bug and is refused.
 *
 *   new ──► screening ──► candidate ──► approved ──► scheduling ──► scheduled
 *                    │            │                             ├─► no_slot
 *                    │            └─► declined                  └─► error
 *                    └─► rejected (AI suggestion) ──► declined (manager confirms)
 *                                                └──► candidate (manager override)
 *   unreadable ──► candidate | declined   (manager decides)
 *
 * "rejected" is only the AI's suggestion. A human always makes the final
 * rejection ("declined"), and only then may a rejection email go out.
 */

export const STATUSES = [
  "new",
  "screening",
  "unreadable",
  "candidate",
  "rejected",
  "declined",
  "approved",
  "scheduling",
  "scheduled",
  "no_slot",
  "error",
] as const;

export type Status = (typeof STATUSES)[number];

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

/** Allowed edges of the state machine: from → [to, …]. */
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  new: ["screening"],
  // screening → new is used to recover a row stuck in "screening" (e.g. server restart).
  screening: ["candidate", "rejected", "error", "new"],
  unreadable: ["candidate", "declined"],
  candidate: ["approved", "declined"],
  rejected: ["candidate", "declined"],
  declined: [],
  approved: ["scheduling"],
  scheduling: ["scheduled", "no_slot", "error"],
  scheduled: [],
  // Retry: back to the step that failed.
  no_slot: ["approved"],
  error: ["new", "approved"],
};

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * The `error` column starts with one of these so «تلاش مجدد» knows which step
 * to repeat. The rest of the string is the message shown in the admin UI.
 */
export const SCREENING_ERROR_PREFIX = "غربالگری ناموفق بود: ";
export const SCHEDULING_ERROR_PREFIX = "زمان‌بندی ناموفق بود: ";

export function isSchedulingFailure(error: string): boolean {
  return error.startsWith(SCHEDULING_ERROR_PREFIX);
}

/** Farsi labels shown in badges. */
export const STATUS_LABEL_FA: Record<Status, string> = {
  new: "جدید",
  screening: "در حال غربالگری",
  unreadable: "ناخوانا",
  candidate: "در انتظار تایید",
  rejected: "رد پیشنهادی (AI)",
  declined: "ردشده",
  approved: "تاییدشده",
  scheduling: "در حال زمان‌بندی",
  scheduled: "زمان‌بندی‌شده",
  no_slot: "بدون زمان خالی",
  error: "خطا",
};

/** Visual tone of each status badge (maps to semantic colors in globals.css). */
export const STATUS_TONE: Record<Status, "neutral" | "info" | "warning" | "success" | "danger"> = {
  new: "neutral",
  screening: "info",
  unreadable: "warning",
  candidate: "warning",
  rejected: "danger",
  declined: "danger",
  approved: "success",
  scheduling: "info",
  scheduled: "success",
  no_slot: "warning",
  error: "danger",
};

/** Filter tabs in the admin table. Each tab covers one or more statuses. */
export const STATUS_FILTERS: { key: string; label: string; statuses: Status[] | null }[] = [
  { key: "all", label: "همه", statuses: null },
  { key: "new", label: "جدید", statuses: ["new", "screening"] },
  { key: "candidate", label: "در انتظار تایید", statuses: ["candidate"] },
  { key: "rejected", label: "ردشده", statuses: ["rejected", "declined"] },
  { key: "approved", label: "تاییدشده", statuses: ["approved", "scheduling"] },
  { key: "scheduled", label: "زمان‌بندی‌شده", statuses: ["scheduled"] },
  { key: "no_slot", label: "بدون زمان خالی", statuses: ["no_slot"] },
  { key: "unreadable", label: "ناخوانا", statuses: ["unreadable"] },
  { key: "error", label: "خطا", statuses: ["error"] },
];
