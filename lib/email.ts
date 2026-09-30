/**
 * Tool: email via Resend.
 *
 * Three messages:
 *   • receipt — fixed Farsi template, no LLM, only if SEND_RECEIPT_EMAILS
 *   • invitation — Communication Agent + .ics attachment
 *   • rejection — Communication Agent, only if SEND_REJECTION_EMAILS,
 *     and only after a manager has declined (the caller enforces that)
 *
 * This module does not write the sheet. The orchestrator records
 * sent / failed on the candidate row, and never calls these again once
 * the status is already "sent".
 */
import { Resend } from "resend";
import { DateTime } from "luxon";
import {
  escapeHtml,
  fallbackInvitation,
  fallbackRejection,
  writeInvitation,
  writeRejection,
  type InvitationFacts,
  type RejectionFacts,
} from "./agents/communication";
import { getEnv } from "./env";
import { formatGregorianDate, formatJalaliDate, formatTime } from "./format";
import { buildInterviewIcs } from "./ics";
import { singleton } from "./singleton";

export type EmailSendResult = { status: "sent" } | { status: "failed"; error: string } | { status: "skipped" };

const MISSING_EMAIL = "ایمیل در رزومه یافت نشد";

function resend(): Resend {
  return singleton("resend", () => new Resend(getEnv().RESEND_API_KEY));
}

/** Fixed RTL shell. The agent's HTML is already sanitized before it arrives here. */
export function wrapRtlEmail(bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;direction:rtl;text-align:right;font-family:Tahoma,sans-serif;color:#1c1917;line-height:1.9;font-size:15px">${bodyHtml}</body></html>`;
}

function receiptHtml(fullName: string, jobTitle: string): string {
  const name = escapeHtml(fullName || "متقاضی گرامی");
  const title = escapeHtml(jobTitle);
  return wrapRtlEmail(
    `<p>${name} عزیز،</p><p>رزومهٔ شما برای موقعیت «${title}» دریافت شد.</p><p>پس از بررسی، نتیجه را از همین نشانی ایمیل به شما اطلاع می‌دهیم.</p>`,
  );
}

async function deliver({
  to,
  subject,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string; contentType: string }[];
}): Promise<EmailSendResult> {
  if (!to.trim()) return { status: "failed", error: MISSING_EMAIL };

  const env = getEnv();
  try {
    const { data, error } = await resend().emails.send({
      from: env.EMAIL_FROM,
      to,
      replyTo: env.MANAGER_EMAIL,
      subject,
      html,
      attachments,
    });
    if (error) {
      console.error("[email] resend rejected:", error.message);
      return { status: "failed", error: error.message || "ارسال ایمیل ناموفق بود." };
    }
    if (!data?.id) return { status: "failed", error: "ارسال ایمیل ناموفق بود." };
    return { status: "sent" };
  } catch (err) {
    console.error("[email] send failed:", (err as Error).message);
    return { status: "failed", error: (err as Error).message || "ارسال ایمیل ناموفق بود." };
  }
}

export async function sendReceipt(input: {
  to: string;
  fullName: string;
  jobTitle: string;
}): Promise<EmailSendResult> {
  if (!getEnv().SEND_RECEIPT_EMAILS) return { status: "skipped" };
  return deliver({
    to: input.to,
    subject: "رزومه شما دریافت شد",
    html: receiptHtml(input.fullName, input.jobTitle),
  });
}

export async function sendInvitation(input: {
  to: string;
  fullName: string;
  position: string;
  start: DateTime;
  end: DateTime;
  iCalUID: string;
}): Promise<EmailSendResult> {
  const env = getEnv();
  const zone = env.MANAGER_TIMEZONE;
  const startIso = input.start.toUTC().toISO() ?? "";
  const facts: InvitationFacts = {
    fullName: input.fullName,
    position: input.position,
    jalaliDate: formatJalaliDate(startIso, zone),
    time: formatTime(startIso, zone),
    gregorianDate: formatGregorianDate(startIso, zone),
    location: env.INTERVIEW_LOCATION,
    managerName: env.MANAGER_NAME,
  };

  // The template repeats the structured facts so a model that drops the date
  // cannot hide it, and a model that invents one is still followed by the real one.
  const copy = input.to.trim() ? await writeInvitation(facts) : fallbackInvitation(facts);
  const html = wrapRtlEmail(
    `${copy.body_html}<p><strong>زمان:</strong> ${escapeHtml(facts.jalaliDate)}، ساعت ${escapeHtml(facts.time)} (${escapeHtml(facts.gregorianDate)})</p><p><strong>محل:</strong> ${escapeHtml(facts.location)}</p>`,
  );

  const ics = buildInterviewIcs({
    uid: input.iCalUID,
    start: input.start,
    end: input.end,
    summary: `مصاحبه: ${input.fullName || "متقاضی"} – ${input.position}`,
    description: `${input.position} — ${facts.location}`,
    location: facts.location,
    organizerEmail: env.MANAGER_EMAIL,
    organizerName: env.MANAGER_NAME,
    attendeeEmail: input.to || undefined,
    attendeeName: input.fullName || undefined,
  });

  return deliver({
    to: input.to,
    subject: copy.subject,
    html,
    attachments: [
      {
        filename: "interview.ics",
        content: ics,
        contentType: "text/calendar; charset=utf-8; method=REQUEST",
      },
    ],
  });
}

export async function sendRejection(input: { to: string; fullName: string; position: string }): Promise<EmailSendResult> {
  if (!getEnv().SEND_REJECTION_EMAILS) return { status: "skipped" };
  const facts: RejectionFacts = { fullName: input.fullName, position: input.position };
  const copy = input.to.trim() ? await writeRejection(facts) : fallbackRejection(facts);
  return deliver({ to: input.to, subject: copy.subject, html: wrapRtlEmail(copy.body_html)   });
}
