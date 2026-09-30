import type { Metadata } from "next";
import Link from "next/link";
import { ApplyShell } from "@/components/apply/ApplyShell";
import { SuccessCheck, SuccessMessage } from "@/components/apply/SuccessCheck";

export const metadata: Metadata = { title: "رزومه دریافت شد" };

/** Shown after a successful upload. Says nothing about screening — on purpose. */
export default function ApplySuccessPage() {
  return (
    <ApplyShell>
      <div className="rounded-2xl border border-border bg-surface px-6 py-10 text-center shadow-[0_8px_30px_rgb(28_25_23/0.06)]">
        <SuccessCheck />
        <SuccessMessage>
          <h1 className="mt-5 text-xl font-bold">رزومه شما با موفقیت دریافت شد</h1>
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-7 text-muted">
            از علاقه‌تان به همکاری با ما سپاسگزاریم. رزومه شما بررسی می‌شود و نتیجه از طریق ایمیل به اطلاعتان خواهد رسید.
          </p>
          <Link
            href="/apply"
            className="mt-6 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded"
          >
            بازگشت به فرم
          </Link>
        </SuccessMessage>
      </div>
    </ApplyShell>
  );
}
