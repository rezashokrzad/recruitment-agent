"use client";

import { FileText, UploadCloud, X } from "lucide-react";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { useRef, useState, type DragEvent } from "react";
import { toFaDigits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "./motion";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Quick check in the browser (the server checks again — never trust the client). */
async function checkFile(file: File, maxMb: number): Promise<string | null> {
  if (file.size === 0) return "فایل انتخاب‌شده خالی است.";
  if (file.size > maxMb * 1024 * 1024) return `حجم فایل نباید بیشتر از ${toFaDigits(maxMb)} مگابایت باشد.`;
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (!PDF_MAGIC.every((b, i) => head[i] === b)) return "فقط فایل PDF پذیرفته می‌شود.";
  return null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${toFaDigits(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
  return `${toFaDigits((bytes / 1024 / 1024).toFixed(1))} مگابایت`;
}

/**
 * Drag-and-drop PDF picker with four visual states:
 * idle (dashed) · drag-over (accent, scale-up, bouncing icon) · file selected (card) · invalid (shake + error)
 */
export function UploadZone({
  file,
  onChange,
  error,
  onError,
  maxMb,
  disabled,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  onError: (message: string | undefined) => void;
  maxMb: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [scope, animate] = useAnimate();
  const reduceMotion = useReducedMotion();

  async function accept(candidate: File | undefined) {
    if (!candidate) return;
    const problem = await checkFile(candidate, maxMb);
    if (problem) {
      onChange(null);
      onError(problem);
      // Gentle shake to say "no" (skipped when the user prefers reduced motion).
      if (!reduceMotion && scope.current) {
        animate(scope.current, { x: [0, -8, 8, -5, 5, 0] }, { duration: 0.35, ease: "easeInOut" });
      }
      return;
    }
    onError(undefined);
    onChange(candidate);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) accept(event.dataTransfer.files?.[0]);
  }

  return (
    <div ref={scope}>
      <input
        ref={inputRef}
        id="file"
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        disabled={disabled}
        aria-describedby={error ? "file-error" : "file-hint"}
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = ""; // allow picking the same file again after removing it
        }}
      />

      <AnimatePresence mode="wait" initial={false}>
        {file ? (
          <motion.div
            key="card"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft p-3"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface text-brand">
              <FileText className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p dir="auto" className="truncate text-sm font-medium" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-muted">{formatSize(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled}
              className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50"
              aria-label="حذف فایل"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        ) : (
          <motion.label
            key="zone"
            htmlFor="file"
            onDragEnter={(e) => {
              e.preventDefault();
              if (!disabled) setDragging(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              // Ignore leave events fired when moving over child elements.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
            }}
            onDrop={onDrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, scale: dragging ? 1.02 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
              dragging ? "border-brand bg-brand-soft" : "border-border-strong bg-background hover:border-brand/50",
              error && !dragging && "border-danger/50 bg-danger-soft/50",
              disabled && "pointer-events-none opacity-60",
            )}
          >
            <motion.span
              animate={dragging && !reduceMotion ? { y: [0, -6, 0] } : { y: 0 }}
              transition={dragging ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.15 }}
              className={cn("grid size-11 place-items-center rounded-full", dragging ? "bg-brand text-white" : "bg-brand-soft text-brand")}
            >
              <UploadCloud className="size-5" />
            </motion.span>
            <span className="text-sm font-medium">
              {dragging ? "فایل را اینجا رها کنید" : "فایل PDF رزومه را بکشید و اینجا رها کنید"}
            </span>
            <span id="file-hint" className="text-xs text-muted">
              یا <span className="font-medium text-brand underline underline-offset-4">از رایانه انتخاب کنید</span> — حداکثر{" "}
              {toFaDigits(maxMb)} مگابایت
            </span>
          </motion.label>
        )}
      </AnimatePresence>
    </div>
  );
}
