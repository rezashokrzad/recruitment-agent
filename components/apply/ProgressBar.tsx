"use client";

import { motion } from "motion/react";
import { toFaDigits } from "@/lib/format";

/**
 * Real upload progress (fed by XMLHttpRequest's upload.onprogress).
 * After 100% the server still extracts text and writes the sheet, so we say so.
 */
export function ProgressBar({ percent }: { percent: number }) {
  const done = percent >= 100;
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex justify-between text-xs text-muted">
        <span>{done ? "در حال پردازش رزومه…" : "در حال بارگذاری…"}</span>
        <span className="tabular-nums">{toFaDigits(Math.round(percent))}٪</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label="پیشرفت بارگذاری"
      >
        {/* origin-right: in RTL the bar fills from right to left */}
        <motion.div
          className="h-full origin-right rounded-full bg-brand"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: percent / 100 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
