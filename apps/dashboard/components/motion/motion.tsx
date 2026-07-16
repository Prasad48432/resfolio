"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ComponentProps, ReactNode } from "react";

/**
 * The dashboard's motion vocabulary (docs/architecture/08-dashboard-ux.md).
 *
 * Every animated surface in the app composes these three components. They
 * exist so that motion is a decision made once, here, rather than a set of
 * inline `transition={{ duration: 0.3 }}` guesses that drift apart — the same
 * reason `PageHeader` and `EmptyState` exist.
 *
 * The values are not arbitrary:
 *
 * - **200ms, ease-out.** Doc 08 budgets product motion at 150–200ms. Ease-out
 *   moves immediately on the first frame — the moment a user actually watches
 *   — so it *feels* faster than ease-in-out at the same duration. There is no
 *   ease-in here on purpose: it delays that first frame and reads as lag.
 * - **8px of travel.** Enough to register as arrival, small enough that it
 *   never turns into a slide the user has to wait out.
 * - **Opacity + transform only.** Both skip layout and paint and run on the
 *   compositor; animating height or margin would not.
 *
 * Motion is decoration here, never a gate: content is interactive on the
 * first frame, and nothing waits on an animation to finish.
 */

/** Matches `--ease-out` in @resfolio/design. Kept in sync by hand — Framer
 *  cannot read a CSS custom property at config time. */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const DURATION = 0.2;
const TRAVEL = 8;

/** Delay between consecutive items in a stagger. Short by design: at 80ms+ a
 *  ten-row list spends a second assembling itself, which reads as slow. */
const STAGGER_STEP = 0.04;

/**
 * Fades and lifts its children in on mount. Use for a page's content region
 * so a route change resolves rather than snaps.
 */
export function FadeIn({
  children,
  delay = 0,
  className,
  ...props
}: ComponentProps<typeof motion.div> & { delay?: number }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : TRAVEL }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION, ease: EASE_OUT, delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

const listVariants: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: STAGGER_STEP } },
};

/**
 * Staggers its `<StaggerItem>` children in. Wrap a list; the cascade reads as
 * the list arriving in order rather than everything materialising at once.
 */
export function Stagger({
  children,
  className,
  ...props
}: ComponentProps<typeof motion.div>) {
  return (
    <motion.div
      initial="hidden"
      animate="shown"
      variants={listVariants}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** One row of a `<Stagger>`. */
export function StaggerItem({
  children,
  className,
  ...props
}: ComponentProps<typeof motion.div>) {
  const reduce = useReducedMotion();

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : TRAVEL },
    shown: {
      opacity: 1,
      y: 0,
      transition: { duration: DURATION, ease: EASE_OUT },
    },
  };

  return (
    <motion.div variants={itemVariants} className={className} {...props}>
      {children}
    </motion.div>
  );
}

/**
 * Content that swaps in place (a save state, a template name). Crossfades
 * without movement — the element is not arriving, it is *changing*, and a
 * translate would imply it came from somewhere.
 *
 * Callers must set a `key` that changes with the content, or nothing animates.
 */
export function SwapIn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.span>
  );
}
