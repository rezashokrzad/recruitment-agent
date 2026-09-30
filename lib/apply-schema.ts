/**
 * Validation rules for the public application form, shared by the browser
 * (instant feedback) and the server (the real check). Messages are Farsi.
 *
 * The form only asks for the PDF (+ job and consent). Name, email and phone
 * are read from the resume by the Contact Extraction Agent (lib/agents/contact.ts).
 * The file itself is validated in lib/storage.ts.
 */
import { z } from "zod";
import { toLatinDigits } from "./format";

/** "۰۹۱۲ ۱۲۳-۴۵۶۷" / "+98 912…" → "09121234567". Other formats pass through digits-only. */
export function normalizePhone(raw: string): string {
  const digits = toLatinDigits(raw).replace(/[\s\-()]/g, "");
  if (/^\+98\d{10}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^0098\d{10}$/.test(digits)) return `0${digits.slice(4)}`;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  return digits;
}

export const ApplyFieldsSchema = z.object({
  job_id: z.string().trim().min(1, "یک موقعیت شغلی انتخاب کنید."),
  consent: z.literal(true, "برای ارسال رزومه، رضایت به پردازش اطلاعات لازم است."),
});

export type ApplyFields = z.infer<typeof ApplyFieldsSchema>;

/** Name of the hidden anti-spam field. Real users never fill it. */
export const HONEYPOT_FIELD = "website";
