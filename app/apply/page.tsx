import type { Metadata } from "next";
import { connection } from "next/server";
import { ApplyForm } from "@/components/apply/ApplyForm";
import { ApplyShell, ApplyHero } from "@/components/apply/ApplyShell";
import { getEnv } from "@/lib/env";
import { listOpenJobs } from "@/lib/sheets";

export const metadata: Metadata = { title: "ارسال رزومه" };

/**
 * /apply (public). Open jobs are read from the sheet on every request
 * (`connection()` opts out of build-time prerendering).
 */
export default async function ApplyPage() {
  await connection();

  let jobs: { job_id: string; title_fa: string }[] = [];
  let loadFailed = false;
  try {
    jobs = (await listOpenJobs()).map(({ job_id, title_fa }) => ({ job_id, title_fa }));
  } catch (err) {
    console.error("[apply] could not load jobs:", err);
    loadFailed = true;
  }

  return (
    <ApplyShell>
      <ApplyHero
        title="به تیم ما بپیوندید"
        subtitle="فقط فایل PDF رزومه‌تان را بارگذاری کنید. پس از بررسی، نتیجه به ایمیلی که در رزومه آمده اطلاع داده می‌شود."
      />
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-[0_8px_30px_rgb(28_25_23/0.06)] sm:p-7">
        {loadFailed ? (
          <p className="py-6 text-center text-danger">بارگذاری فرم ممکن نشد. لطفاً چند دقیقه بعد دوباره تلاش کنید.</p>
        ) : (
          <ApplyForm jobs={jobs} maxMb={getEnv().MAX_RESUME_MB} />
        )}
      </div>
    </ApplyShell>
  );
}
