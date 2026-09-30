"use client";

import { cn } from "@/lib/utils";
import { toFaDigits } from "@/lib/format";
import { STATUS_FILTERS } from "@/lib/status";

/** Filter tabs above the table, each with a live count. */
export function StatusTabs({
  active,
  counts,
  onChange,
}: {
  active: string;
  counts: Record<string, number>;
  onChange: (key: string) => void;
}) {
  return (
    <div role="tablist" aria-label="فیلتر وضعیت" className="flex gap-1 overflow-x-auto pb-1">
      {STATUS_FILTERS.map((filter) => {
        const selected = filter.key === active;
        return (
          <button
            key={filter.key}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(filter.key)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              selected ? "bg-brand-soft font-medium text-brand" : "text-muted hover:bg-hover hover:text-foreground",
            )}
          >
            {filter.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs",
                selected ? "bg-brand/10" : "bg-hover text-subtle",
              )}
            >
              {toFaDigits(counts[filter.key] ?? 0)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
