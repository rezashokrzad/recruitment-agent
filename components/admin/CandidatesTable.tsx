"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { formatJalaliDateTime, toFaDigits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import type { CandidateListItem } from "./types";

const COLUMNS = ["نام", "ایمیل", "تلفن", "موقعیت شغلی", "وضعیت", "امتیاز", "مصاحبه", "تاریخ ثبت"];

/**
 * Dense data table with a sticky header. On narrow screens it scrolls
 * horizontally inside its own container instead of breaking the page.
 */
export function CandidatesTable({
  rows,
  jobTitles,
  timezone,
  loading,
  selectedId,
  onSelect,
}: {
  rows: CandidateListItem[];
  jobTitles: Record<string, string>;
  timezone: string;
  loading: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="max-h-[calc(100vh-15rem)] overflow-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[920px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_var(--border)]">
          <tr>
            {COLUMNS.map((col) => (
              <th key={col} className="px-3 py-2.5 text-start text-xs font-medium whitespace-nowrap text-muted">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-t border-border">
                {COLUMNS.map((col) => (
                  <td key={col} className="px-3 py-3">
                    <Skeleton className="h-4 w-full max-w-28" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-3 py-16 text-center text-muted">
                موردی یافت نشد.
              </td>
            </tr>
          )}

          {!loading &&
            rows.map((c) => (
              <tr
                key={c.id}
                onClick={() => onSelect?.(c.id)}
                className={cn(
                  "border-t border-border transition-colors",
                  onSelect && "cursor-pointer hover:bg-hover",
                  selectedId === c.id && "bg-brand-soft hover:bg-brand-soft",
                )}
              >
                <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                  {c.full_name || <span className="font-normal text-subtle">{c.original_filename || "نام نامشخص"}</span>}
                </td>
                <td className="px-3 py-2.5 text-muted">
                  {c.email ? <span className="ltr">{c.email}</span> : "—"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                  {c.phone ? <span className="ltr">{toFaDigits(c.phone)}</span> : "—"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{jobTitles[c.job_id] ?? c.job_id}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-3 py-2.5 tabular-nums">{c.score ? toFaDigits(c.score) : "—"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                  {c.interview_start ? formatJalaliDateTime(c.interview_start, timezone) : "—"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                  {formatJalaliDateTime(c.created_at, timezone) || "—"}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
