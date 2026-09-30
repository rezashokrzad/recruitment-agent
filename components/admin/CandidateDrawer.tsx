"use client";

import { FileX, Mail, Phone, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatJalaliDateTime, toFaDigits } from "@/lib/format";
import type { Candidate } from "@/lib/sheets";
import { isSchedulingFailure, type Status } from "@/lib/status";
import { StatusBadge } from "./StatusBadge";
import type { CandidateListItem } from "./types";

/**
 * Candidate detail drawer. In RTL it slides in from the LEFT edge.
 * Shows the PDF (streamed by the protected /api/resumes/[id]), extracted text,
 * screening results and the manager note.
 */
type Action = "approve" | "decline" | "override" | "retry";

export function CandidateDrawer({
  candidateId,
  jobTitle,
  timezone,
  onClose,
  onPatch,
}: {
  candidateId: string | null;
  jobTitle: (jobId: string) => string;
  timezone: string;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<CandidateListItem>) => void;
}) {
  // Close on Escape.
  useEffect(() => {
    if (!candidateId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [candidateId, onClose]);

  return (
    <MotionConfig reducedMotion="user">
    <AnimatePresence>
      {candidateId && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-foreground/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.aside
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label="جزئیات متقاضی"
            className="fixed inset-y-0 left-0 z-50 flex w-full max-w-3xl flex-col border-e border-border bg-surface shadow-xl"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* key: remount per candidate so its data loads fresh */}
            <DrawerBody
              key={candidateId}
              id={candidateId}
              jobTitle={jobTitle}
              timezone={timezone}
              onClose={onClose}
              onPatch={onPatch}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
    </MotionConfig>
  );
}

function DrawerBody({
  id,
  jobTitle,
  timezone,
  onClose,
  onPatch,
}: {
  id: string;
  jobTitle: (jobId: string) => string;
  timezone: string;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<CandidateListItem>) => void;
}) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<Action | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/candidates/${id}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        if (!cancelled) {
          setCandidate(body.candidate);
          setNote(body.candidate.manager_note ?? "");
        }
      })
      .catch((err) => !cancelled && setError(err.message || "خطا در بارگذاری"));
    return () => {
      cancelled = true;
    };
  }, [id]);

  function applyLocal(next: Candidate) {
    setCandidate(next);
    const { resume_text, ...rest } = next;
    onPatch(id, { ...rest, has_text: resume_text.length > 0 });
  }

  async function run(action: Action) {
    if (!candidate || pending) return;
    const snapshot = candidate;
    const optimistic = optimisticStatus(candidate, action);
    applyLocal({ ...candidate, status: optimistic });
    setPending(action);
    try {
      const res = await fetch(`/api/candidates/${id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manager_note: note }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "عملیات ناموفق بود.");
      applyLocal(body.candidate);
      toast.success(successText(action, body.candidate, timezone));
    } catch (err) {
      applyLocal(snapshot);
      toast.error((err as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          {candidate ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold">{candidate.full_name || "نام در رزومه یافت نشد"}</h2>
                <StatusBadge status={candidate.status} />
              </div>
              <p className="mt-0.5 text-sm text-muted">{jobTitle(candidate.job_id)}</p>
            </>
          ) : (
            <>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-2 h-4 w-56" />
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          aria-label="بستن"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {error && <p className="rounded-lg bg-danger-soft p-4 text-sm text-danger">{error}</p>}
        {!candidate && !error && <DrawerSkeleton />}
        {candidate && <CandidateDetails candidate={candidate} timezone={timezone} />}
      </div>

      {candidate && (
        <footer className="space-y-3 border-t border-border px-5 py-4">
          <label className="block text-xs font-medium text-muted">
            یادداشت مدیر
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              className="mt-1 w-full resize-y rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:outline-none"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {candidate.status === "candidate" && (
              <Button size="sm" onClick={() => run("approve")} disabled={pending !== null}>
                {pending === "approve" ? "در حال تایید…" : "تایید"}
              </Button>
            )}
            {(candidate.status === "candidate" || candidate.status === "unreadable" || candidate.status === "rejected") && (
              <Button variant="danger" size="sm" onClick={() => run("decline")} disabled={pending !== null}>
                {pending === "decline" ? "در حال رد…" : "رد"}
              </Button>
            )}
            {(candidate.status === "rejected" || candidate.status === "unreadable") && (
              <Button variant="secondary" size="sm" onClick={() => run("override")} disabled={pending !== null}>
                {pending === "override" ? "…" : "برگرداندن به کاندید"}
              </Button>
            )}
            {canRetry(candidate.status) && (
              <Button variant="secondary" size="sm" onClick={() => run("retry")} disabled={pending !== null}>
                {pending === "retry" ? "در حال تلاش…" : "تلاش مجدد"}
              </Button>
            )}
          </div>
        </footer>
      )}
    </>
  );
}

function canRetry(status: string): boolean {
  return status === "error" || status === "no_slot" || status === "approved" || status === "scheduling";
}

function optimisticStatus(candidate: Candidate, action: Action): Status {
  if (action === "approve") return "scheduling";
  if (action === "decline") return "declined";
  if (action === "override") return "candidate";
  if (candidate.status === "error" && !isSchedulingFailure(candidate.error)) return "screening";
  return "scheduling";
}

function successText(action: Action, candidate: Candidate, timezone: string): string {
  if (action === "decline") return "متقاضی رد شد.";
  if (action === "override") return "متقاضی به فهرست کاندیدها برگشت.";
  if (candidate.status === "scheduled" && candidate.interview_start) {
    return `مصاحبه ثبت شد: ${formatJalaliDateTime(candidate.interview_start, timezone)}`;
  }
  if (candidate.status === "no_slot") return "در بازه جستجو زمان خالی پیدا نشد.";
  if (candidate.status === "error") return candidate.error || "عملیات با خطا مواجه شد.";
  if (candidate.status === "candidate" || candidate.status === "rejected") return "غربالگری انجام شد.";
  return "انجام شد.";
}

function CandidateDetails({ candidate: c, timezone }: { candidate: Candidate; timezone: string }) {
  const matched = c.matched_skills ? c.matched_skills.split("|").map((s) => s.trim()).filter(Boolean) : [];
  const missing = c.missing_requirements ? c.missing_requirements.split("|").map((s) => s.trim()).filter(Boolean) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {c.email ? (
          <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-muted hover:text-brand">
            <Mail className="size-4" />
            <span className="ltr">{c.email}</span>
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-subtle">
            <Mail className="size-4" />
            ایمیل در رزومه یافت نشد
          </span>
        )}
        {c.phone ? (
          <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 text-muted hover:text-brand">
            <Phone className="size-4" />
            <span className="ltr">{toFaDigits(c.phone)}</span>
          </a>
        ) : null}
        <span className="text-muted">ثبت: {formatJalaliDateTime(c.created_at, timezone)}</span>
      </div>

      {c.error && (
        <p className="rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
          <span className="font-medium">خطا: </span>
          {c.error}
        </p>
      )}

      {c.interview_start && (
        <Section title="مصاحبه">
          <p className="text-sm">{formatJalaliDateTime(c.interview_start, timezone)}</p>
          <EmailLine label="دعوت‌نامه" value={c.invite_email_status} />
        </Section>
      )}

      {c.rejection_email_status && (
        <EmailLine label="ایمیل رد" value={c.rejection_email_status} />
      )}
      {c.receipt_email_status && <EmailLine label="رسید دریافت" value={c.receipt_email_status} />}

      <Section title="نتیجه غربالگری">
        {c.score ? (
          <div className="space-y-3">
            <p className="text-sm">
              امتیاز: <span className="text-lg font-bold tabular-nums">{toFaDigits(c.score)}</span>
              <span className="text-muted"> / ۱۰۰</span>
            </p>
            {c.rationale_fa && <p className="text-sm leading-7">{c.rationale_fa}</p>}
            {matched.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {matched.map((s) => (
                  <Badge key={s} tone="success">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
            {missing.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {missing.map((s) => (
                  <Badge key={s} tone="danger">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">هنوز غربالگری نشده است.</p>
        )}
      </Section>

      <Section title="فایل رزومه">
        {c.resume_path ? (
          <iframe
            src={`/api/resumes/${c.id}`}
            title={`رزومه ${c.full_name || c.original_filename}`}
            className="h-[70vh] w-full rounded-lg border border-border bg-hover"
          />
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border-strong px-4 py-6 text-sm text-muted">
            <FileX className="size-4" />
            فایل PDF برای این متقاضی موجود نیست.
          </div>
        )}
      </Section>

      <Section title="متن استخراج‌شده">
        {c.resume_text ? (
          <details className="group rounded-lg border border-border">
            <summary className="cursor-pointer px-4 py-2.5 text-sm text-muted select-none hover:bg-hover">
              نمایش متن ({toFaDigits(c.resume_text.length.toLocaleString("en-US"))} نویسه)
            </summary>
            <pre dir="auto" className="max-h-96 overflow-auto border-t border-border px-4 py-3 font-sans text-sm leading-7 whitespace-pre-wrap">
              {c.resume_text}
            </pre>
          </details>
        ) : (
          <p className="text-sm text-muted">متنی از این فایل استخراج نشد (احتمالاً PDF اسکن‌شده است).</p>
        )}
      </Section>
    </div>
  );
}

function EmailLine({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  const failed = value.startsWith("failed:");
  const text = value === "sent" ? "ارسال شد" : failed ? value.slice("failed:".length).trim() : value;
  return (
    <p className={`text-sm ${failed ? "text-danger" : "text-muted"}`}>
      {label}: {text}
    </p>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium text-muted">{title}</h3>
      {children}
    </section>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-[50vh] w-full" />
    </div>
  );
}
