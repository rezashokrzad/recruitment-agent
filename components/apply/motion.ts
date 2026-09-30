/**
 * Shared animation settings for the applicant pages.
 *
 * Rules: short (150–400ms), eased, never blocking. RTL: things enter from the
 * RIGHT, so the starting x offset is positive.
 * <MotionConfig reducedMotion="user"> (in the page) turns off transform
 * animations for people who ask their OS for reduced motion; opacity fades remain.
 */
import type { Transition, Variants } from "motion/react";

export const EASE_OUT: Transition["ease"] = [0.22, 1, 0.36, 1];

/** Hero title/subtitle: fade + slide in from the right. */
export const heroVariants: Variants = {
  hidden: { opacity: 0, x: 24 },
  show: { opacity: 1, x: 0, transition: { duration: 0.4, ease: EASE_OUT } },
};

/** Form container: reveals its children one after another, ~60ms apart. */
export const staggerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
};

/** One form field inside the staggered container. */
export const fieldVariants: Variants = {
  hidden: { opacity: 0, x: 16 },
  show: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE_OUT } },
};

/** Inline error under a field: grows open and fades in. */
export const errorVariants: Variants = {
  hidden: { opacity: 0, height: 0, y: -4 },
  show: { opacity: 1, height: "auto", y: 0, transition: { duration: 0.2, ease: EASE_OUT } },
};
