"use client";

import { useReducedMotion as useFramerReducedMotion } from "framer-motion";
import type { Transition, Variants } from "framer-motion";

/**
 * Shared motion language for the whole landing page. The benchmark is the
 * hero's soft "focus-in": a gentle upward drift with a small blur that
 * resolves on a natural ease-out. Everything reveals this way so the page
 * feels calm and cohesive rather than snapping into place.
 */
export const softEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Scroll-reveal variant: fade + slight rise + subtle de-blur. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, filter: "blur(6px)" },
  visible: { opacity: 1, filter: "blur(0px)" },
};

/** Shared `whileInView` viewport options — trigger once, slightly early. */
export const viewport = { once: true, margin: "-60px" } as const;

/** Gentle staggered timing for items revealed in a list/grid. */
export function staggerTransition(
  index: number,
  { base = 0.09, duration = 0.7 }: { base?: number; duration?: number } = {},
): Transition {
  return { duration, delay: index * base, ease: softEase };
}

/** A single soft reveal (no stagger). */
export const softTransition: Transition = { duration: 0.7, ease: softEase };

/** Wraps Framer Motion's hook so callers get a plain boolean. */
export function usePrefersReducedMotion() {
  return useFramerReducedMotion() ?? false;
}
