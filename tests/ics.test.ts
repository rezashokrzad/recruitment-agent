/**
 * iCalendar invitation: METHOD:REQUEST, the Google event UID, UTC times, CRLF,
 * and folding of long lines. No network.
 */
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { sanitizeEmailHtml } from "@/lib/agents/communication";
import { sendInvitation, sendRejection } from "@/lib/email";
import { buildInterviewIcs, foldLine } from "@/lib/ics";

const start = DateTime.fromISO("2026-10-05T12:00:00", { zone: "Asia/Tehran" });
const end = start.plus({ minutes: 45 });

function ics(extra: Partial<Parameters<typeof buildInterviewIcs>[0]> = {}) {
  return buildInterviewIcs({
    uid: "evt123@google.com",
    start,
    end,
    summary: "مصاحبه: سارا محمدی – مهندس هوش مصنوعی",
    description: "امتیاز: ۸۰",
    location: "دفتر تهران",
    organizerEmail: "manager@example.com",
    organizerName: "مدیر",
    attendeeEmail: "sara@example.com",
    attendeeName: "سارا محمدی",
    ...extra,
  });
}

describe("buildInterviewIcs", () => {
  it("is a REQUEST whose UID, organizer and UTC times match the calendar event", () => {
    const text = ics();
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(text).toContain("METHOD:REQUEST\r\n");
    expect(text).toContain("UID:evt123@google.com\r\n");
    expect(text).toContain("ORGANIZER;CN=مدیر:mailto:manager@example.com\r\n");
    expect(text).toContain("DTSTART:20261005T083000Z\r\n");
    expect(text).toContain("DTEND:20261005T091500Z\r\n");
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.includes("\n") && !text.includes("\r\n")).toBe(false);
  });

  it("folds lines longer than 75 octets without splitting a UTF-8 character", () => {
    const long = "SUMMARY:" + "رزومه".repeat(40);
    const folded = foldLine(long);
    expect(folded).toContain("\r\n ");
    for (const part of folded.split("\r\n")) {
      const content = part.startsWith(" ") ? part.slice(1) : part;
      expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
      expect(content).not.toMatch(/\uFFFD/);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });

  it("escapes commas and newlines in the summary", () => {
    const text = ics({ summary: "مصاحبه: نام, فامیل\nطبقه ۲" });
    expect(text).toContain("SUMMARY:مصاحبه: نام\\, فامیل\\nطبقه ۲");
  });
});

describe("email guards", () => {
  it("fails the invitation with a clear error when the resume has no email", async () => {
    const result = await sendInvitation({
      to: "",
      fullName: "علی",
      position: "مهندس هوش مصنوعی",
      start,
      end,
      iCalUID: "evt123@google.com",
    });
    expect(result).toEqual({ status: "failed", error: "ایمیل در رزومه یافت نشد" });
  });

  it("does not send a rejection while SEND_REJECTION_EMAILS is off", async () => {
    const result = await sendRejection({ to: "sara@example.com", fullName: "سارا", position: "مهندس" });
    expect(result).toEqual({ status: "skipped" });
  });
});

describe("sanitizeEmailHtml", () => {
  it("keeps simple tags and drops scripts, styles and attributes", () => {
    const clean = sanitizeEmailHtml(
      `<p onclick="alert(1)">سلام</p><script>alert(1)</script><a href="https://evil">لینک</a><strong>مهم</strong>`,
    );
    expect(clean).toContain("<p>سلام</p>");
    expect(clean).toContain("<strong>مهم</strong>");
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("<a");
    expect(clean).toContain("لینک");
  });
});
