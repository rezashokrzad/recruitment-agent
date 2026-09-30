"use client";

import { Loader2, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApplyFieldsSchema, HONEYPOT_FIELD } from "@/lib/apply-schema";
import { cn } from "@/lib/utils";
import { FieldError } from "./FieldError";
import { errorVariants, fieldVariants, staggerVariants } from "./motion";
import { ProgressBar } from "./ProgressBar";
import { UploadZone } from "./UploadZone";

type Job = { job_id: string; title_fa: string };
type Errors = Partial<Record<"job_id" | "consent" | "file", string>>;

/**
 * Upload with XMLHttpRequest instead of fetch: only XHR reports upload
 * progress (`xhr.upload.onprogress`), which drives the progress bar.
 */
function postWithProgress(form: FormData, onProgress: (percent: number) => void) {
  return new Promise<{ status: number; body: { error?: string; fieldErrors?: Errors } }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/apply");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
    xhr.upload.onload = () => onProgress(100);
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(form);
  });
}

/**
 * The applicant only uploads a PDF. Name, email and phone are read from the
 * resume on the server. The job dropdown appears only when more than one job is open.
 */
export function ApplyForm({ jobs, maxMb }: { jobs: Job[]; maxMb: number }) {
  const router = useRouter();
  const [jobId, setJobId] = useState(jobs.length === 1 ? jobs[0].job_id : "");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const uploading = progress !== null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError("");

    // 1) Same zod rules as the server, for instant feedback.
    const parsed = ApplyFieldsSchema.safeParse({ job_id: jobId, consent });
    const nextErrors: Errors = {};
    if (!file) nextErrors.file = errors.file ?? "فایل رزومه را انتخاب کنید.";
    if (!parsed.success) {
      for (const issue of parsed.error.issues) nextErrors[issue.path[0] as keyof Errors] ??= issue.message;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    // 2) Upload.
    const form = new FormData();
    form.append("job_id", jobId);
    form.append("consent", String(consent));
    form.append(HONEYPOT_FIELD, honeypot);
    form.append("file", file!);

    setProgress(0);
    try {
      const { status, body } = await postWithProgress(form, setProgress);
      if (status >= 200 && status < 300) {
        router.push("/apply/success");
        return; // keep the loading state while navigating
      }
      setErrors(body.fieldErrors ?? {});
      // Field errors are shown under their field; only show the banner for other errors.
      if (!body.fieldErrors) setFormError(body.error ?? "ارسال با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
    } catch {
      setFormError("ارتباط با سرور برقرار نشد. اتصال اینترنت خود را بررسی کنید و دوباره تلاش کنید.");
    }
    setProgress(null);
  }

  if (jobs.length === 0) {
    return <p className="py-6 text-center text-muted">در حال حاضر موقعیت شغلی فعالی برای ارسال رزومه وجود ندارد.</p>;
  }

  return (
    <motion.form
      onSubmit={onSubmit}
      noValidate
      variants={staggerVariants}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      {jobs.length === 1 ? (
        <motion.p variants={fieldVariants} className="text-center text-sm text-muted">
          موقعیت شغلی: <span className="font-medium text-foreground">{jobs[0].title_fa}</span>
        </motion.p>
      ) : (
        <motion.div variants={fieldVariants} className="space-y-1.5">
          <label htmlFor="job_id" className="block text-sm font-medium">
            موقعیت شغلی
          </label>
          <select
            id="job_id"
            className={cn(
              "h-11 w-full appearance-none rounded-xl border border-border-strong bg-surface bg-[length:1rem] bg-[left_0.9rem_center] bg-no-repeat pe-3.5 ps-10 text-[15px] transition-colors",
              "focus-visible:outline-none focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15",
              "aria-[invalid=true]:border-danger disabled:opacity-60",
            )}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2378716c' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
            }}
            value={jobId}
            onChange={(e) => {
              setJobId(e.target.value);
              setErrors((er) => ({ ...er, job_id: undefined }));
            }}
            disabled={uploading}
            aria-invalid={!!errors.job_id}
            aria-describedby="job_id-error"
          >
            <option value="" disabled>
              یک موقعیت را انتخاب کنید
            </option>
            {jobs.map((job) => (
              <option key={job.job_id} value={job.job_id}>
                {job.title_fa}
              </option>
            ))}
          </select>
          <FieldError id="job_id-error" message={errors.job_id} />
        </motion.div>
      )}

      <motion.div variants={fieldVariants}>
        <UploadZone
          file={file}
          onChange={(f) => {
            setFile(f);
            if (f) setErrors((e) => ({ ...e, file: undefined }));
          }}
          error={errors.file}
          onError={(message) => setErrors((e) => ({ ...e, file: message }))}
          maxMb={maxMb}
          disabled={uploading}
        />
        <FieldError id="file-error" message={errors.file} />
      </motion.div>

      {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={HONEYPOT_FIELD}>وب‌سایت</label>
        <input
          id={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <motion.div variants={fieldVariants}>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6">
          <input
            id="consent"
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-[var(--brand)]"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              setErrors((er) => ({ ...er, consent: undefined }));
            }}
            disabled={uploading}
            aria-invalid={!!errors.consent}
            aria-describedby="consent-error"
          />
          <span className="text-muted">با پردازش اطلاعات رزومه‌ام برای این فرایند استخدام موافقم.</span>
        </label>
        <FieldError id="consent-error" message={errors.consent} />
      </motion.div>

      <motion.div variants={fieldVariants} className="space-y-4">
        <AnimatePresence initial={false}>
          {formError && (
            <motion.div
              variants={errorVariants}
              initial="hidden"
              animate="show"
              exit="hidden"
              role="alert"
              className="overflow-hidden"
            >
              <p className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">{formError}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {uploading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <ProgressBar percent={progress} />
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={uploading}
          className={cn(
            "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-medium text-brand-foreground",
            "transition-[background-color,transform] duration-150 hover:bg-brand-hover active:scale-[0.99]",
            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 disabled:cursor-not-allowed disabled:opacity-70",
          )}
        >
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-4 -scale-x-100" />}
          {uploading ? "در حال ارسال…" : "ارسال رزومه"}
        </button>
      </motion.div>
    </motion.form>
  );
}
