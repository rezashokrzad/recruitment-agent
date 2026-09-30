/**
 * Orchestration step: resume intake (what happens when someone applies).
 *
 *   validate job + consent → validate file bytes → job is open?
 *   → extract text → Contact Extraction Agent (name, email, phone)
 *   → [queue] duplicate check → save PDF → append sheet row
 *   → log "applicant: → new | unreadable"
 *
 * Kept free of HTTP details so it can be unit-tested (tests/upload-validation.test.ts).
 * The route sends the receipt email and, when SCREEN_ON_UPLOAD is on,
 * starts screening after the HTTP response — the applicant never sees the result.
 */
import { nanoid } from "nanoid";
import { extractContact, findEmail, type Contact } from "./agents/contact";
import { ApplyFieldsSchema, type ApplyFields } from "./apply-schema";
import { extractResumeText } from "./pdf";
import { intakeQueue } from "./queue";
import { appendCandidate, appendLog, getJob, listCandidates, nowIso } from "./sheets";
import { deleteResume, saveResume, validateResumeFile } from "./storage";

export type IntakeInput = {
  fields: Record<string, unknown>;
  file: File | null;
  honeypot: string;
};

export type IntakeResult =
  | { ok: true; candidateId: string; status: "new" | "unreadable"; contact: Contact; spam?: false }
  | { ok: true; spam: true }
  | { ok: false; httpStatus: number; error: string; fieldErrors?: Record<string, string> };

const fail = (httpStatus: number, error: string, fieldErrors?: Record<string, string>): IntakeResult => ({
  ok: false,
  httpStatus,
  error,
  fieldErrors,
});

export async function submitApplication({ fields, file, honeypot }: IntakeInput): Promise<IntakeResult> {
  // 1) Honeypot: bots fill every field. Pretend success, store nothing.
  if (honeypot.trim() !== "") return { ok: true, spam: true };

  // 2) Form fields (only job + consent — everything else comes from the resume).
  const parsed = ApplyFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return fail(400, "لطفاً خطاهای فرم را برطرف کنید.", fieldErrors);
  }
  const data: ApplyFields = parsed.data;

  // 3) The file — checked by its bytes (magic number + size), not its name.
  if (!file || file.size === 0) return fail(400, "فایل رزومه را انتخاب کنید.", { file: "فایل رزومه را انتخاب کنید." });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileCheck = validateResumeFile(bytes);
  if (!fileCheck.ok) return fail(400, fileCheck.error, { file: fileCheck.error });

  // 4) The job must exist and be open.
  const job = await getJob(data.job_id);
  if (!job || !job.is_open) {
    return fail(400, "این موقعیت شغلی دیگر فعال نیست.", { job_id: "این موقعیت شغلی دیگر فعال نیست." });
  }

  // 5) Extract text, then name/email/phone from it (slow — done before entering the queue).
  const extracted = await extractResumeText(bytes);
  const status = extracted.readable ? "new" : "unreadable";
  const contact: Contact = extracted.readable
    ? await extractContact(extracted.text)
    : { full_name: "", email: findEmail(extracted.text), phone: "" };

  // 6) Duplicate check + save + append, atomically with respect to other applications.
  return intakeQueue(async (): Promise<IntakeResult> => {
    if (contact.email) {
      const existing = await listCandidates();
      const duplicate = existing.some((c) => isSameApplicant(c, contact, data.job_id));
      if (duplicate) {
        const error = "رزومه‌ای با همین ایمیل قبلاً برای این موقعیت شغلی ثبت شده است.";
        return fail(409, error, { file: error });
      }
    }

    const id = nanoid(12);
    const resumePath = await saveResume(id, bytes);
    try {
      await appendCandidate({
        id,
        full_name: contact.full_name,
        email: contact.email,
        phone: contact.phone,
        job_id: data.job_id,
        resume_path: resumePath,
        original_filename: cleanFilename(file.name),
        resume_text: extracted.text,
        status,
        consent_at: nowIso(),
      });
    } catch (err) {
      await deleteResume(resumePath); // don't leave an orphan file behind
      throw err;
    }

    const missing = (["full_name", "email", "phone"] as const).filter((k) => !contact[k]);
    await appendLog([
      {
        candidate_id: id,
        from_status: "",
        to_status: status,
        actor: "applicant",
        details:
          `resume uploaded (${extracted.pages} page(s), ${extracted.text.length} chars)` +
          (missing.length ? `; not found in resume: ${missing.join(", ")}` : ""),
      },
    ]).catch((err) => console.error("[intake] log append failed:", err));

    return { ok: true, candidateId: id, status, contact };
  });
}

/**
 * A repeat application is the same email and the same name for this job.
 * Resumes often reuse one address in the header while the person is different
 * (سارا احمدی vs علی رضایی). If either name is missing, the email alone decides,
 * because there is nothing else to tell the two rows apart.
 */
function isSameApplicant(
  existing: { email: string; full_name: string; job_id: string },
  contact: Contact,
  jobId: string,
): boolean {
  if (existing.job_id !== jobId) return false;
  if (existing.email.trim().toLowerCase() !== contact.email) return false;
  const prev = personKey(existing.full_name ?? "");
  const next = personKey(contact.full_name);
  if (!prev || !next) return true;
  return prev === next;
}

function personKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ");
}

/** Keep the original filename for display only: no path parts, no control chars, bounded length. */
function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200) || "resume.pdf";
}
