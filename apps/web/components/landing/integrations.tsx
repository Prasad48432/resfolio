"use client";

import { motion } from "framer-motion";
import { FaGithub, FaDribbble, FaBehance, FaMedium } from "react-icons/fa";
import { SiSubstack, SiFigma, SiNotion, SiYoutube } from "react-icons/si";
import { fadeUp, staggerTransition, viewport } from "@/lib/motion";
import { TEST_IDS } from "@/lib/testids";

const primary = [
  {
    Icon: FaGithub,
    name: "GitHub",
    hint: "Repos, stars, pinned projects and contributions.",
  },
  {
    Icon: FaDribbble,
    name: "Dribbble",
    hint: "Shots, palettes and case-study highlights.",
  },
  {
    Icon: FaBehance,
    name: "Behance",
    hint: "Long-form project galleries and process shots.",
  },
  {
    Icon: FaMedium,
    name: "Medium",
    hint: "Essays, publications and long-form writing.",
  },
];

const secondary = [
  { Icon: SiSubstack, name: "Substack" },
  { Icon: SiFigma, name: "Figma" },
  { Icon: SiNotion, name: "Notion" },
  { Icon: SiYoutube, name: "YouTube" },
];

export default function Integrations() {
  return (
    <section
      id="integrations"
      data-testid={TEST_IDS.integrationsSection}
      className="cv-auto relative border-t border-border py-24 md:py-32"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="max-w-2xl">
          <span className="label-eyebrow">Integrations</span>
          <h2 className="mt-4 font-display text-4xl leading-[1.02] text-foreground md:text-6xl">
            Import your work from everywhere.
          </h2>
          <p className="mt-5 max-w-xl text-[15px] text-muted md:text-lg">
            Connect the platforms you already use and pull in just what you
            approve — projects, posts, shots and writing — structured into one
            profile you control.
          </p>
        </div>

        <div className="mt-14 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {primary.map((p, i) => (
            <motion.div
              key={p.name}
              initial="hidden"
              whileInView="visible"
              viewport={viewport}
              variants={fadeUp}
              transition={staggerTransition(i, { base: 0.05 })}
              data-testid={`integration-${p.name.toLowerCase()}`}
              className="card-surface group relative overflow-hidden p-5 transition hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <p.Icon size={22} className="text-foreground/80" aria-hidden />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                  import
                </span>
              </div>
              <p className="mt-4 font-display text-2xl text-foreground">
                {p.name}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-muted">
                {p.hint}
              </p>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span className="label-eyebrow mr-2">Coming next</span>
          {secondary.map((s) => (
            <div
              key={s.name}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] text-muted"
            >
              <s.Icon size={12} aria-hidden />
              {s.name}
            </div>
          ))}
          <span className="text-[12px] text-muted/70">&amp; more</span>
        </div>
      </div>
    </section>
  );
}
