"use client";

import { AnimatePresence, motion } from "motion/react";
import { errorVariants } from "./motion";

/** Farsi error message that animates open under a field (no alert popups). */
export function FieldError({ id, message }: { id: string; message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p
          key={message}
          id={id}
          role="alert"
          variants={errorVariants}
          initial="hidden"
          animate="show"
          exit="hidden"
          className="overflow-hidden text-sm text-danger"
        >
          <span className="block pt-1.5">{message}</span>
        </motion.p>
      )}
    </AnimatePresence>
  );
}
