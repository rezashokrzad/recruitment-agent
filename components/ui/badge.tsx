import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "info" | "warning" | "success" | "danger" | "brand";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-hover text-muted border-border",
  info: "bg-info-soft text-info border-info/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  success: "bg-success-soft text-success border-success/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  brand: "bg-brand-soft text-brand border-brand/20",
};

export function Badge({ className, tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
