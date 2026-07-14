"use client";

import { motion } from "framer-motion";
import { Link2, Pencil, Rocket } from "lucide-react";
import { fadeUp, staggerTransition, viewport } from "@/lib/motion";
import { TEST_IDS } from "@/lib/testids";

const steps = [
  {
    n: "01",
    icon: Link2,
    title: "Connect once",
    body: "Import your work from GitHub, Dribbble, Behance and Medium. We gather your best projects — no messy spreadsheets.",
    tag: "One-click import",
  },
  {
    n: "02",
    icon: Pencil,
    title: "Curate the truth",
    body: "One editor for skills, experience, projects and stories. Change your job title once, and it updates everywhere.",
    tag: "Single source",
  },
  {
    n: "03",
    icon: Rocket,
    title: "Ship, then forget",
    body: "Publish a live portfolio to resfolio.me/you or your own domain, and export a polished resume — always current.",
    tag: "Custom domain",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how"
      data-testid={TEST_IDS.howItWorks}
      className="cv-auto relative py-24 md:py-32"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <span className="label-eyebrow">How it works</span>
            <h2 className="mt-4 max-w-3xl font-display text-4xl leading-[1.02] text-foreground md:text-6xl">
              Three moves. Every surface{" "}
              <span className="italic text-accent">in sync</span>.
            </h2>
          </div>
          <p className="max-w-sm text-[15px] text-muted">
            The dull, repetitive part of career maintenance — resumes, bios,
            portfolios — collapsed into one flow.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.article
              key={s.n}
              initial="hidden"
              whileInView="visible"
              viewport={viewport}
              variants={fadeUp}
              transition={staggerTransition(i)}
              data-testid={`how-step-${i + 1}`}
              className="card-surface group relative flex min-h-[300px] flex-col justify-between overflow-hidden p-8"
            >
              <div
                aria-hidden
                className="absolute -right-1 -top-5 select-none font-display text-[180px] leading-none text-foreground/5"
              >
                {s.n}
              </div>
              <div className="relative">
                <div className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface text-accent">
                  <s.icon size={16} aria-hidden />
                </div>
                <h3 className="mt-6 font-display text-3xl text-foreground">
                  {s.title}
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-muted">
                  {s.body}
                </p>
              </div>
              <div className="relative mt-8 flex items-center justify-between font-mono text-[11px]">
                <span className="text-accent">{s.tag}</span>
                <span className="text-muted">STEP {s.n}</span>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
