/**
 * Tool: a hand-written iCalendar invitation (RFC 5545).
 *
 * The Google event is created without attendees (a service account cannot
 * invite people). The candidate receives this .ics file by email instead.
 * UID must be the Google event's iCalUID so a later update refers to the
 * same event. Times are UTC. Lines use CRLF and fold at 75 octets.
 */
import { DateTime } from "luxon";

export type IcsInput = {
  uid: string;
  start: DateTime;
  end: DateTime;
  summary: string;
  description: string;
  location: string;
  organizerEmail: string;
  organizerName: string;
  attendeeEmail?: string;
  attendeeName?: string;
};

const CRLF = "\r\n";

/** Escape TEXT values: backslash, semicolon, comma, and newlines. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** yyyyMMdd'T'HHmmss'Z' */
function formatUtc(dt: DateTime): string {
  return dt.toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
}

/**
 * Fold a content line at 75 octets. Continuation lines start with one space.
 * Splits on UTF-8 boundaries so a Farsi character is never cut in half.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let offset = 0;
  let budget = 75;
  while (offset < bytes.length) {
    let end = Math.min(offset + budget, bytes.length);
    while (end > offset && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    if (end === offset) end = Math.min(offset + budget, bytes.length);
    parts.push(bytes.subarray(offset, end).toString("utf8"));
    offset = end;
    budget = 74;
  }
  return parts.join(`${CRLF} `);
}

export function buildInterviewIcs(input: IcsInput, now: DateTime = DateTime.utc()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Didrah Recruitment//FA",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${escapeText(input.uid)}`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatUtc(input.start)}`,
    `DTEND:${formatUtc(input.end)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    `DESCRIPTION:${escapeText(input.description)}`,
    `LOCATION:${escapeText(input.location)}`,
    `ORGANIZER;CN=${escapeText(input.organizerName)}:mailto:${input.organizerEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
  ];

  if (input.attendeeEmail) {
    const cn = input.attendeeName ? `;CN=${escapeText(input.attendeeName)}` : "";
    lines.push(`ATTENDEE${cn};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${input.attendeeEmail}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
