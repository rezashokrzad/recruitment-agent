import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground",
        "placeholder:text-subtle transition-colors",
        "focus-visible:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20",
        "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
