/**
 * Scheduling rules from the spec. All instants are in Asia/Tehran.
 * Iran has not observed daylight-saving time since 2022, so local 12:00
 * is always 08:30 UTC (offset +03:30).
 */
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { findFirstSlot, intervalsOverlap, type BusyInterval, type SchedulerConfig } from "@/lib/scheduler";

const TZ = "Asia/Tehran";

const base: SchedulerConfig = {
  timezone: TZ,
  stepMinutes: 15,
  minLeadHours: 24,
  searchWeeks: 6,
};

/** "2026-10-04T09:00" → that clock time in Tehran. */
function tehran(local: string): DateTime {
  const dt = DateTime.fromISO(local, { zone: TZ });
  if (!dt.isValid) throw new Error(`bad datetime ${local}`);
  return dt;
}

function busy(start: string, end: string): BusyInterval {
  return { start: tehran(start), end: tehran(end) };
}

function expectSlot(slot: { start: DateTime; end: DateTime } | null, startLocal: string) {
  expect(slot).not.toBeNull();
  const start = tehran(startLocal);
  expect(slot!.start.toISO()).toBe(start.toISO());
  expect(slot!.end.toISO()).toBe(start.plus({ minutes: 45 }).toISO());
  expect(slot!.start.hour).toBe(start.hour);
  expect(slot!.start.minute).toBe(start.minute);
  expect(slot!.start.offset).toBe(210);
}

describe("findFirstSlot", () => {
  // Sunday 4 Oct 2026 09:00 + 24h → Monday 5 Oct 09:00, so the first window is Monday 12:00.
  const sundayMorning = tehran("2026-10-04T09:00");

  it("empty calendar → first eligible Monday 12:00", () => {
    expect(sundayMorning.weekday).toBe(7);
    expectSlot(findFirstSlot([], sundayMorning, base), "2026-10-05T12:00");
  });

  it("Mon busy 12:00–12:30 → Mon 12:30", () => {
    const slot = findFirstSlot([busy("2026-10-05T12:00", "2026-10-05T12:30")], sundayMorning, base);
    expectSlot(slot, "2026-10-05T12:30");
  });

  it("Mon busy 12:00–12:20 and 13:00–13:30 → Tue 12:00", () => {
    const slot = findFirstSlot(
      [busy("2026-10-05T12:00", "2026-10-05T12:20"), busy("2026-10-05T13:00", "2026-10-05T13:30")],
      sundayMorning,
      base,
    );
    expectSlot(slot, "2026-10-06T12:00");
  });

  it("Mon–Wed all fully busy → next Monday 12:00", () => {
    const full = ["2026-10-05", "2026-10-06", "2026-10-07"].map((day) => busy(`${day}T12:00`, `${day}T14:00`));
    expectSlot(findFirstSlot(full, sundayMorning, base), "2026-10-12T12:00");
  });

  it("now = Tue 10:00, MIN_LEAD_HOURS=24 → Wed 12:00", () => {
    const tuesday = tehran("2026-10-06T10:00");
    expect(tuesday.weekday).toBe(2);
    expectSlot(findFirstSlot([], tuesday, base), "2026-10-07T12:00");
  });

  it("an event ending exactly at 12:00 does not block Monday 12:00", () => {
    expectSlot(findFirstSlot([busy("2026-10-05T11:00", "2026-10-05T12:00")], sundayMorning, base), "2026-10-05T12:00");
  });

  it("touching intervals do not overlap, including a slot that ends when a busy block starts", () => {
    const start = tehran("2026-10-05T12:00");
    const end = start.plus({ minutes: 45 });
    expect(intervalsOverlap(start, end, tehran("2026-10-05T12:45"), tehran("2026-10-05T13:30"))).toBe(false);
    expect(intervalsOverlap(start, end, tehran("2026-10-05T11:15"), start)).toBe(false);
    expect(intervalsOverlap(start, end, tehran("2026-10-05T12:30"), tehran("2026-10-05T13:00"))).toBe(true);
  });

  it("everything busy within the horizon → null", () => {
    const now = tehran("2026-10-04T09:00");
    const full: BusyInterval[] = [];
    for (let day = tehran("2026-10-05T00:00"); day < now.plus({ weeks: 8 }); day = day.plus({ days: 1 })) {
      if (day.weekday >= 1 && day.weekday <= 3) full.push(busy(day.toISODate() + "T12:00", day.toISODate() + "T14:00"));
    }
    expect(findFirstSlot(full, now, base)).toBeNull();
  });

  it("stays on 12:00 Tehran time across the old Nowruz DST date (no DST, offset +03:30)", () => {
    const beforeNowruz = tehran("2026-03-20T09:00");
    expect(beforeNowruz.weekday).toBe(5); // Friday
    const slot = findFirstSlot([], beforeNowruz, base);
    expectSlot(slot, "2026-03-23T12:00");
    expect(slot!.start.offset).toBe(210);
    expect(slot!.start.toUTC().toFormat("HH:mm")).toBe("08:30");

    const summer = findFirstSlot([], tehran("2026-07-05T09:00"), base);
    expect(summer!.start.offset).toBe(210);
    expect(summer!.start.hour).toBe(12);
  });
});
