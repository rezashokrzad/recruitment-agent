/**
 * Scheduler: a pure function. No LLM, no network, no clock of its own —
 * the caller passes `now` and the busy intervals from Google Calendar.
 *
 * Rules (all in the manager's timezone):
 *   • Monday, Tuesday, Wednesday only, window 12:00–14:00
 *   • an interview is 45 minutes and must END by 14:00, so the last start is 13:15
 *   • starts step every `stepMinutes` (12:00, 12:15, …)
 *   • the first start must be at least `minLeadHours` after `now`
 *   • walk Mon → Tue → Wed → next week, and return the FIRST free slot
 *   • two intervals that only touch (one ends when the other starts) do not overlap
 *   • nothing free inside `searchWeeks` → null
 */
import { DateTime } from "luxon";

export const INTERVIEW_MINUTES = 45;
const WINDOW_START_MINUTES = 12 * 60;
const WINDOW_END_MINUTES = 14 * 60;
const ALLOWED_WEEKDAYS = [1, 2, 3]; // Luxon: Monday = 1 … Sunday = 7

export type BusyInterval = { start: DateTime; end: DateTime };
export type Slot = { start: DateTime; end: DateTime };

export type SchedulerConfig = {
  timezone: string;
  stepMinutes: number;
  minLeadHours: number;
  searchWeeks: number;
};

/** True when the two ranges share any instant. Touching at an endpoint is NOT an overlap. */
export function intervalsOverlap(aStart: DateTime, aEnd: DateTime, bStart: DateTime, bEnd: DateTime): boolean {
  return aStart.toMillis() < bEnd.toMillis() && aEnd.toMillis() > bStart.toMillis();
}

/**
 * First interview slot that is inside the window, far enough in the future,
 * and clear of every busy interval. `null` when the horizon is exhausted.
 */
export function findFirstSlot(busyIntervals: BusyInterval[], now: DateTime, config: SchedulerConfig): Slot | null {
  const zone = config.timezone;
  const zonedNow = now.setZone(zone);
  const earliest = zonedNow.plus({ hours: config.minLeadHours });
  // Include the whole last day, so a slot later that day is still inside the horizon.
  const horizonEnd = earliest.plus({ weeks: config.searchWeeks }).endOf("day");

  const busy = busyIntervals.filter((b) => b.end.toMillis() > b.start.toMillis());

  let day = earliest.startOf("day");
  const lastDay = horizonEnd.startOf("day");

  while (day <= lastDay) {
    if (ALLOWED_WEEKDAYS.includes(day.weekday)) {
      for (let minute = WINDOW_START_MINUTES; minute + INTERVIEW_MINUTES <= WINDOW_END_MINUTES; minute += config.stepMinutes) {
        const start = day.set({
          hour: Math.floor(minute / 60),
          minute: minute % 60,
          second: 0,
          millisecond: 0,
        });
        if (start.toMillis() < earliest.toMillis()) continue;
        if (start.toMillis() > horizonEnd.toMillis()) return null;

        const end = start.plus({ minutes: INTERVIEW_MINUTES });
        const taken = busy.some((b) => intervalsOverlap(start, end, b.start, b.end));
        if (!taken) return { start, end };
      }
    }
    day = day.plus({ days: 1 });
  }

  return null;
}
