"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { fadeUp, softTransition, viewport } from "@/lib/motion";
import { TEST_IDS } from "@/lib/testids";

/**
 * "Same data, many templates" — the core promise made visible. One profile
 * object is rendered through three different template layouts (light and
 * dark). Auto-rotates, and users can pick a template. All rendered as real
 * DOM, no images.
 */

const profile = {
  name: "Alex Morgan",
  role: "Senior Product Designer",
  location: "Lisbon",
  bio: "Designer building calm interfaces for noisy industries.",
  tags: ["Product", "Design Systems", "Motion"],
  projects: [
    { name: "Fjord", meta: "Rebrand" },
    { name: "Pulse", meta: "Design system" },
    { name: "Halo", meta: "Onboarding" },
    { name: "Atlas", meta: "Case study" },
  ],
};

const templates = [
  { id: "editorial", label: "Editorial", tone: "light" as const },
  { id: "terminal", label: "Terminal", tone: "dark" as const },
  { id: "minimal", label: "Minimal", tone: "light" as const },
];

export default function Preview() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const id = window.setInterval(
      () => setActive((a) => (a + 1) % templates.length),
      4500,
    );
    return () => window.clearInterval(id);
  }, []);

  const current = templates[active]!;

  return (
    <section
      id="preview"
      data-testid={TEST_IDS.previewSection}
      className="cv-auto relative overflow-hidden border-t border-border py-24 md:py-32"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="label-eyebrow">Live preview</span>
            <h2 className="mt-4 font-display text-4xl leading-[1.02] text-foreground md:text-6xl">
              One profile. Every template.
            </h2>
            <p className="mt-5 max-w-xl text-[15px] text-muted md:text-lg">
              The same data, presented beautifully. Switch templates whenever
              you like — your content never moves.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Portfolio templates"
            className="flex flex-wrap gap-2"
          >
            {templates.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active === i}
                data-testid={`preview-template-${t.id}`}
                onClick={() => setActive(i)}
                className={`rounded-full border px-4 py-1.5 text-[13px] font-medium transition ${
                  active === i
                    ? "border-transparent bg-foreground text-background"
                    : "border-border bg-surface text-muted hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          variants={fadeUp}
          transition={softTransition}
          className="mt-12"
        >
          <div
            data-testid={TEST_IDS.portfolioBrowserMock}
            className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_30px_80px_rgba(38,32,25,0.10)]"
          >
            {/* Browser chrome */}
            <div className="flex items-center gap-3 border-b border-border bg-background/60 px-4 py-3">
              <div className="flex gap-1.5" aria-hidden>
                <span className="h-3 w-3 rounded-full bg-foreground/15" />
                <span className="h-3 w-3 rounded-full bg-foreground/15" />
                <span className="h-3 w-3 rounded-full bg-foreground/15" />
              </div>
              <div className="flex flex-1 justify-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1 font-mono text-[12px] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-live" />
                  https://<span className="text-foreground">alex.dev</span>
                  <span className="hidden text-muted sm:inline">
                    · {current.label} template
                  </span>
                </div>
              </div>
              <div className="w-16" />
            </div>

            {/* Template canvas */}
            <div key={current.id} className="animate-focus-in">
              {current.id === "editorial" && <EditorialTemplate />}
              {current.id === "terminal" && <TerminalTemplate />}
              {current.id === "minimal" && <MinimalTemplate />}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ── Template 1: Editorial (light, serif) ─────────────────────────────── */
function EditorialTemplate() {
  return (
    <div className="min-h-[420px] bg-[#f7f2e9] p-6 md:p-12">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
          {profile.name} · {profile.location}
        </p>
        <h3 className="mt-4 font-display text-4xl leading-tight text-foreground md:text-5xl">
          {profile.bio}
        </h3>
        <p className="mt-5 max-w-md text-[14px] text-muted">
          {profile.role}. Selected work below — case studies, systems and the
          occasional side quest.
        </p>
        <div className="mt-8 divide-y divide-border border-y border-border">
          {profile.projects.map((p) => (
            <div
              key={p.name}
              className="flex items-baseline justify-between py-3"
            >
              <span className="font-display text-xl text-foreground">
                {p.name}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
                {p.meta}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Template 2: Terminal (dark, mono) ────────────────────────────────── */
function TerminalTemplate() {
  return (
    <div className="grid min-h-[420px] gap-6 bg-[#131211] p-6 text-white md:grid-cols-12 md:p-10">
      <div className="md:col-span-8">
        <p className="font-mono text-[12px] text-white/50">$ whoami</p>
        <h3 className="mt-3 font-mono text-2xl font-semibold text-white md:text-3xl">
          {profile.name}
        </h3>
        <p className="mt-2 max-w-sm font-mono text-[13px] leading-relaxed text-white/60">
          {profile.bio} {profile.role}, based in {profile.location}.
        </p>
        <div className="mt-6 space-y-2">
          {profile.projects.map((p, i) => (
            <div
              key={p.name}
              className="flex items-center justify-between rounded-md border border-white/10 bg-white/3 px-3 py-2 font-mono text-[12px]"
            >
              <span className="text-white/85">
                <span className="text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>{" "}
                {p.name}
              </span>
              <span className="text-white/40">{p.meta}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden md:col-span-4 md:block">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
          Index
        </p>
        <ul className="mt-3 space-y-1.5 font-mono text-[12px] text-white/55">
          {["Experience", "Projects", "Open Source", "Writing"].map((s, i) => (
            <li key={s} className={i === 0 ? "text-white" : ""}>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── Template 3: Minimal (light, sans) ────────────────────────────────── */
function MinimalTemplate() {
  return (
    <div className="min-h-[420px] bg-surface p-6 md:p-12">
      <div className="flex flex-col gap-2">
        <h3 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {profile.name}
        </h3>
        <p className="text-[15px] text-muted">
          {profile.role} · {profile.location}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {profile.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-border px-3 py-1 text-[11px] text-muted"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3">
        {profile.projects.map((p) => (
          <div
            key={p.name}
            className="rounded-xl border border-border bg-background/50 p-4 transition hover:border-accent/40"
          >
            <div className="text-[15px] font-medium text-foreground">
              {p.name}
            </div>
            <div className="mt-1 text-[12px] text-muted">{p.meta}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
