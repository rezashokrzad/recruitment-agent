"use client";

import { motion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { heroVariants } from "./motion";

/**
 * Centered, mobile-first layout for the applicant pages.
 * `reducedMotion="user"` honors the OS "reduce motion" setting for every animation inside.
 */
export function ApplyShell({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10 sm:py-16">{children}</main>
    </MotionConfig>
  );
}

/** Title + subtitle that fade and slide in from the right on page load. */
export function ApplyHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <motion.header variants={heroVariants} initial="hidden" animate="show" className="mb-6 text-center sm:mb-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 text-[15px] leading-7 text-muted">{subtitle}</p>
    </motion.header>
  );
}
