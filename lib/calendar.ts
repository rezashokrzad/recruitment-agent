/**
 * Tool: Google Calendar.
 *
 * freebusy tells the scheduler which intervals are taken. Creating the
 * interview event happens only after a second freebusy check of that exact
 * slot (see the orchestrator). Attendees are intentionally omitted: a
 * service account cannot invite people without domain-wide delegation.
 * The candidate is invited by email + an .ics file instead.
 */
import { google, type calendar_v3 } from "googleapis";
import { DateTime } from "luxon";
import { getEnv } from "./env";
import { getGoogleAuth } from "./google-auth";
import { intervalsOverlap, type BusyInterval } from "./scheduler";
import { singleton } from "./singleton";

function api(): calendar_v3.Calendar {
  return singleton("calendarApi", () => google.calendar({ version: "v3", auth: getGoogleAuth() }));
}

function isForbidden(err: unknown): boolean {
  const e = err as { code?: number | string; status?: number; response?: { status?: number } };
  return e.code === 403 || e.code === "403" || e.status === 403 || e.response?.status === 403;
}

/** Busy intervals on the manager's calendar between the two instants. */
export async function getBusy(timeMin: DateTime, timeMax: DateTime): Promise<BusyInterval[]> {
  const env = getEnv();
  const res = await api().freebusy.query({
    requestBody: {
      timeMin: timeMin.toUTC().toISO()!,
      timeMax: timeMax.toUTC().toISO()!,
      timeZone: env.MANAGER_TIMEZONE,
      items: [{ id: env.MANAGER_CALENDAR_ID }],
    },
  });

  const calendar = res.data.calendars?.[env.MANAGER_CALENDAR_ID];
  if (calendar?.errors?.length) {
    const reason = calendar.errors.map((e) => e.reason).filter(Boolean).join(", ");
    throw new Error(
      `تقویم در دسترس نیست (${reason}). تقویم مدیر را با ایمیل سرویس‌اکانت با سطح «Make changes to events» به اشتراک بگذارید.`,
    );
  }

  return (calendar?.busy ?? []).flatMap((interval) => {
    if (!interval.start || !interval.end) return [];
    const start = DateTime.fromISO(interval.start, { setZone: true });
    const end = DateTime.fromISO(interval.end, { setZone: true });
    return start.isValid && end.isValid ? [{ start, end }] : [];
  });
}

/** True when nothing on the calendar overlaps [start, end). Touching is allowed. */
export async function isSlotFree(start: DateTime, end: DateTime): Promise<boolean> {
  const busy = await getBusy(start, end);
  return !busy.some((b) => intervalsOverlap(start, end, b.start, b.end));
}

export type InterviewEventInput = {
  fullName: string;
  jobTitle: string;
  email: string;
  phone: string;
  score: string;
  rationale: string;
  start: DateTime;
  end: DateTime;
};

export type CreatedEvent = { id: string; iCalUID: string };

/**
 * Create the interview. Throws a Farsi error the admin UI can show.
 * A 403 means the service account can see free/busy but cannot edit events.
 */
export async function createInterviewEvent(input: InterviewEventInput): Promise<CreatedEvent> {
  const env = getEnv();
  try {
    const res = await api().events.insert({
      calendarId: env.MANAGER_CALENDAR_ID,
      requestBody: {
        summary: `مصاحبه: ${input.fullName || "متقاضی"} – ${input.jobTitle}`,
        description: [
          `ایمیل: ${input.email || "—"}`,
          `تلفن: ${input.phone || "—"}`,
          `امتیاز: ${input.score || "—"}`,
          "",
          input.rationale,
        ].join("\n"),
        location: env.INTERVIEW_LOCATION,
        start: { dateTime: input.start.toISO()!, timeZone: env.MANAGER_TIMEZONE },
        end: { dateTime: input.end.toISO()!, timeZone: env.MANAGER_TIMEZONE },
      },
    });

    const id = res.data.id;
    const iCalUID = res.data.iCalUID;
    if (!id || !iCalUID) throw new Error("Google Calendar did not return an event id");
    return { id, iCalUID };
  } catch (err) {
    if (isForbidden(err) || (err as Error).message?.includes("Make changes to events")) {
      console.error("[calendar] 403 creating event:", (err as Error).message);
      throw new Error(
        "دسترسی ساخت رویداد در تقویم وجود ندارد. تقویم مدیر را با ایمیل سرویس‌اکانت با سطح «Make changes to events» به اشتراک بگذارید.",
      );
    }
    if ((err as Error).message?.includes("Google Calendar did not return")) throw err;
    console.error("[calendar] create event failed:", (err as Error).message);
    throw new Error("ساخت رویداد تقویم ناموفق بود.");
  }
}

/** iCalUID of an event we already created, so a retry can resend the .ics without a second event. */
export async function getEventIcalUid(eventId: string): Promise<string> {
  const env = getEnv();
  const res = await api().events.get({ calendarId: env.MANAGER_CALENDAR_ID, eventId });
  if (!res.data.iCalUID) throw new Error("شناسه iCal رویداد پیدا نشد.");
  return res.data.iCalUID;
}
