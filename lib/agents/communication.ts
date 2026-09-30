/**
 * Communication Agent (LLM).
 *
 * Writes the Farsi subject and a short HTML body for two emails:
 * an interview invitation, and a rejection. It receives structured facts
 * only and is told not to add any date, place, or name that was not given.
 *
 * The HTML is stripped down to a few tags before it is dropped into the
 * fixed RTL shell in lib/email.ts. If the model call fails, a fixed
 * sentence built from the same facts is used — still no invented details.
 */
import { z } from "zod";
import { llmJson } from "../llm";

const CopySchema = z.object({
  subject: z.string().min(1),
  body_html: z.string().min(1),
});

export type EmailCopy = z.infer<typeof CopySchema>;

export type InvitationFacts = {
  fullName: string;
  position: string;
  jalaliDate: string;
  time: string;
  gregorianDate: string;
  location: string;
  managerName: string;
};

export type RejectionFacts = {
  fullName: string;
  position: string;
};

const SYSTEM_PROMPT = `شما متن ایمیل‌های استخدام را به فارسی می‌نویسید.
فقط از واقعیت‌هایی که در پیام کاربر آمده استفاده کنید. تاریخ، ساعت، مکان، نام یا لینک جدید نسازید.
اگر واقعیتی داده نشده، درباره‌اش چیزی ننویسید.

خروجی فقط یک شیء JSON:
- subject: موضوع ایمیل، یک خط، بدون HTML
- body_html: بدنه با تگ‌های ساده p و strong و br فقط، راست‌به‌چپ، دو یا سه جمله، بدون امضای جعلی

تاریخ، ساعت و محل را داخل body_html ننویس؛ قالب ایمیل آن‌ها را جداگانه و عیناً اضافه می‌کند.`;

const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "ul", "ol", "li"]);

/** Names and job titles come from resumes, so they must not be treated as HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Drop every tag and attribute except a small allow-list, so model HTML cannot carry scripts. */
export function sanitizeEmailHtml(input: string): string {
  let html = input.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\/?\s*([a-zA-Z0-9]+)(\s[^>]*)?\s*\/?>/g, (full, tag: string) => {
    const name = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    if (name === "br") return "<br>";
    return /^<\s*\//.test(full) ? `</${name}>` : `<${name}>`;
  });
  return html.trim().slice(0, 4000);
}

export function cleanSubject(subject: string): string {
  return subject.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 150);
}

function factsBlock(lines: string[]): string {
  return lines.filter(Boolean).map((line) => `- ${line}`).join("\n");
}

async function writeCopy(label: string, facts: string, fallback: EmailCopy): Promise<EmailCopy> {
  try {
    const { data } = await llmJson({ label, system: SYSTEM_PROMPT, user: facts, schema: CopySchema });
    const body = sanitizeEmailHtml(data.body_html);
    const subject = cleanSubject(data.subject);
    if (!body || !subject) return fallback;
    return { subject, body_html: body };
  } catch (err) {
    console.warn(`[communication] ${label} failed, using the fixed template:`, (err as Error).message);
    return fallback;
  }
}

export function fallbackInvitation(facts: InvitationFacts): EmailCopy {
  const name = escapeHtml(facts.fullName || "متقاضی گرامی");
  const position = escapeHtml(facts.position);
  return {
    subject: `دعوت به مصاحبه — ${facts.position}`.slice(0, 150),
    body_html: `<p>${name} عزیز،</p><p>برای موقعیت «${position}» به مصاحبه دعوت می‌شوید.</p>`,
  };
}

export function fallbackRejection(facts: RejectionFacts): EmailCopy {
  const name = escapeHtml(facts.fullName || "متقاضی گرامی");
  const position = escapeHtml(facts.position);
  return {
    subject: `نتیجه بررسی رزومه — ${facts.position}`.slice(0, 150),
    body_html: `<p>${name} عزیز،</p><p>از وقتی که برای ارسال رزومهٔ موقعیت «${position}» گذاشتید سپاسگزاریم. در این مرحله امکان ادامهٔ همکاری فراهم نشد.</p><p>برایتان آرزوی موفقیت داریم.</p>`,
  };
}

export async function writeInvitation(facts: InvitationFacts): Promise<EmailCopy> {
  return writeCopy(
    "invitation",
    [
      "نوع ایمیل: دعوت به مصاحبه",
      "فقط از این واقعیت‌ها استفاده کن:",
      factsBlock([
        `نام: ${facts.fullName || "متقاضی"}`,
        `موقعیت شغلی: ${facts.position}`,
        `تاریخ شمسی: ${facts.jalaliDate}`,
        `ساعت: ${facts.time}`,
        `تاریخ میلادی (داخل پرانتز): ${facts.gregorianDate}`,
        `محل: ${facts.location}`,
        `نام میزبان: ${facts.managerName}`,
      ]),
    ].join("\n"),
    fallbackInvitation(facts),
  );
}

export async function writeRejection(facts: RejectionFacts): Promise<EmailCopy> {
  return writeCopy(
    "rejection",
    [
      "نوع ایمیل: اعلام عدم پذیرش، محترمانه و کوتاه",
      "امتیاز، دلیل رد، و هیچ تاریخ یا مکانی ننویس.",
      "فقط از این واقعیت‌ها استفاده کن:",
      factsBlock([`نام: ${facts.fullName || "متقاضی"}`, `موقعیت شغلی: ${facts.position}`]),
    ].join("\n"),
    fallbackRejection(facts),
  );
}
