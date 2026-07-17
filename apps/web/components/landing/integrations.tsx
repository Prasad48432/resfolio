"use client";

import { motion } from "framer-motion";
import { FaGithub } from "react-icons/fa";
import { SiDevdotto, SiStackoverflow, SiRss } from "react-icons/si";
import { fadeUp, staggerTransition, viewport } from "@/lib/motion";
import { TEST_IDS } from "@/lib/testids";

/** `id` mirrors the connector ids in `@resfolio/integrations` — these four
 *  are the whole V1 registry, and all of them are public-data connectors. */
const primary = [
  {
    id: "github",
    Icon: FaGithub,
    name: "GitHub",
    hint: "Repos, stars, languages and pinned projects.",
  },
  {
    id: "rss",
    Icon: SiRss,
    name: "RSS",
    hint: "Any feed — Substack, Medium, or your own blog.",
  },
  {
    id: "devto",
    Icon: SiDevdotto,
    name: "Dev.to",
    hint: "Published posts, tags and reactions.",
  },
  {
    id: "stackoverflow",
    Icon: SiStackoverflow,
    name: "Stack Overflow",
    hint: "Answers, reputation and the tags you know best.",
  },
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
            Every source reads public data — no OAuth, no passwords, nothing
            stored. Give us a username or a feed URL, review what we find, and
            import only what you want. It becomes ordinary profile content, and
            it&apos;s yours to edit from there.
          </p>
        </div>

        <div className="mt-14 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {primary.map((p, i) => (
            <motion.div
              key={p.id}
              initial="hidden"
              whileInView="visible"
              viewport={viewport}
              variants={fadeUp}
              transition={staggerTransition(i, { base: 0.05 })}
              data-testid={`integration-${p.id}`}
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

        <p className="mt-8 text-[13px] text-muted">
          Nothing to import? Sources are optional — you can write your profile
          by hand and never connect a thing.
        </p>
      </div>
    </section>
  );
}
