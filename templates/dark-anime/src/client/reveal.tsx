"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Scroll-reveal — a client island (doc 05).
 *
 * **Content is a child, never a prop**, so the markup inside is still rendered
 * on the server and lands in the HTML: this island animates content that is
 * already there, and a visitor with JS off (or a crawler) sees the whole page.
 * An island that gates content behind hydration would not belong in a template.
 *
 * `prefers-reduced-motion` means gentler, not none (doc 08): the movement goes,
 * the opacity fade stays.
 */
export function Reveal({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-64px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
