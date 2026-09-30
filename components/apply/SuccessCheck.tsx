"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT } from "./motion";

/** Animated checkmark: the circle draws itself, then the tick (SVG path-length animation). */
export function SuccessCheck() {
  return (
    <motion.svg
      viewBox="0 0 52 52"
      className="mx-auto size-20 text-success"
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      aria-hidden="true"
    >
      <circle cx="26" cy="26" r="25" fill="var(--success-soft)" />
      <motion.circle
        cx="26"
        cy="26"
        r="23"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      />
      <motion.path
        d="M15 27 l7 7 l15 -15"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.35, ease: EASE_OUT }}
      />
    </motion.svg>
  );
}

/** The confirmation text: a subtle rise-in after the checkmark. */
export function SuccessMessage({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.45, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
