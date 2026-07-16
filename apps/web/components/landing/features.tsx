"use client";

import { motion } from "framer-motion";
import {
  Database,
  Globe,
  Rocket,
  FileText,
  LayoutTemplate,
  ShieldCheck,
  Check,
  type LucideIcon,
} from "lucide-react";
import { fadeUp, staggerTransition, viewport } from "@/lib/motion";
import { TEST_IDS } from "@/lib/testids";

type DemoKind =
  | "source-of-truth"
  | "domain"
  | "launch"
  | "resume"
  | "templates"
  | "ownership";

type FeatureItem = {
  span?: string;
  Icon: LucideIcon;
  title: string;
  body: string;
  demo: DemoKind;
};

const items: FeatureItem[] = [
  {
    span: "md:col-span-2 md:row-span-2",
    Icon: Database,
    title: "One source. Every surface.",
    body: "Edit your role, projects, or bio in a single place. Your resume, portfolio site, and public API stay perfectly in sync — no copy-pasting between five different profiles.",
    demo: "source-of-truth",
  },
  {
    Icon: Globe,
    title: "Custom domain",
    body: "Point your own domain. HTTPS, SEO, and social previews are handled.",
    demo: "domain",
  },
  {
    Icon: Rocket,
    title: "One-click launch",
    body: "Pick a curated, open-source template. We bind your profile to it and deploy — no setup, no code.",
    demo: "launch",
  },
  {
    Icon: FileText,
    title: "Resume export",
    body: "One click for an ATS-friendly PDF, Markdown, or a shareable link — always up to date.",
    demo: "resume",
  },
  {
    Icon: LayoutTemplate,
    title: "Curated templates",
    body: "Modern, animated and minimal layouts in both light and dark. Switch anytime — your data stays put.",
    demo: "templates",
  },
  {
    Icon: ShieldCheck,
    title: "You own it",
    body: "Your data is yours. Export to JSON or PDF and leave whenever — no lock-in, ever.",
    demo: "ownership",
  },
];

function Demo({ kind }: { kind: DemoKind }) {
  switch (kind) {
    case "source-of-truth":
      return (
        <div className="mt-6 rounded-xl border border-border bg-background/70 p-4 font-mono text-[11px] leading-relaxed">
          <div className="text-muted">{"// resfolio.profile"}</div>
          <div className="text-foreground/80">
            <span className="text-accent">title</span>
            <span className="text-muted">:</span>{" "}
            <span className="text-live">
              &quot;Senior Product Designer&quot;
            </span>
          </div>
          <div className="mt-2 text-muted">↳ propagates to</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-foreground/75 md:hidden">
            {["portfolio", "resume.pdf", "/api/me"].map((t) => (
              <span
                key={t}
                className="rounded border border-border bg-surface px-2 py-1 text-center"
              >
                {t}
              </span>
            ))}
          </div>

          <div className="hidden md:grid grid-cols-3 gap-2">
            <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_10px_26px_rgba(38,32,25,0.10)]">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <span className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
                </span>

                <span className="ml-auto flex items-center gap-2 rounded-full border border-border px-2 py-0.5">
                  <span className="h-2 w-2 rounded-full bg-live" />
                  alex.dev
                </span>
              </div>

              {/* Hero */}
              <div className="bg-linear-to-br from-accent/12 to-transparent px-5 py-5">
                <div className="h-14 w-14 rounded-full border border-border bg-foreground/8" />
                <div className="mt-4 h-3 w-36 rounded-full bg-foreground/10" />
              </div>

              {/* Work grid */}
              <div className="flex flex-1 flex-col gap-4 px-5 pb-5">
                <div className="h-2 w-24 rounded-full bg-foreground/8" />

                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i}>
                      <div className="h-4 rounded-xl border border-border bg-foreground/8" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-[0_10px_26px_rgba(38,32,25,0.10)]">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 rounded-full border border-border px-2 py-0.5">
                  <span className="h-2 w-2 rounded-full bg-live" />
                  resume.pdf
                </span>

                <div className="h-3 w-16 rounded-full bg-foreground/10" />
              </div>

              {/* Name */}
              <div className="mt-5 h-7 w-40 rounded-full bg-foreground/10" />

              {/* Role */}
              <div className="mt-2 h-4 w-28 rounded-full bg-foreground/8" />

              <div className="mt-5 border-t border-border pt-4">
                {/* Experience heading */}
                <div className="h-3 w-24 rounded-full bg-foreground/10" />

                <div className="mt-4 flex flex-col gap-5">
                  {[1].map((i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="h-4 w-32 rounded-full bg-foreground/10" />
                        <div className="h-3 w-16 rounded-full bg-foreground/8" />
                      </div>
                      <div className="mt-2 h-3 w-24 rounded-full bg-foreground/8" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex min-w-0 flex-col justify-center overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-[0_6px_18px_rgba(38,32,25,0.06)]">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-wider text-muted">
                  GET /api/me
                </span>

                <span className="rounded bg-live/12 px-1 py-0.5 font-mono text-xs font-semibold text-live">
                  200
                </span>
              </div>

              <div className="space-y-2 font-mono text-sm leading-6">
                <div>
                  <span className="text-foreground/50">{"{"}</span>
                </div>

                <div className="flex items-center gap-2 pl-4">
                  <span className="text-accent">{'"name"'}</span>
                  <span>:</span>
                  <div className="h-3 w-24 rounded-full bg-live/25" />
                </div>

                <div className="flex items-center gap-2 pl-4">
                  <span className="text-accent">{'"age"'}</span>
                  <span>:</span>
                  <div className="h-3 w-8 rounded-full bg-foreground/10" />
                </div>

                <div className="flex items-center gap-2 pl-4">
                  <span className="text-accent">{'"role"'}</span>
                  <span>:</span>
                  <div className="h-3 w-32 rounded-full bg-live/25" />
                </div>

                <div>
                  <span className="text-foreground/50">{"}"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    case "domain":
      return (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 font-mono text-[12px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-live" />
          <span className="text-muted">https://</span>
          <span className="text-foreground">yourname.dev</span>
        </div>
      );
    case "launch":
      return (
        <div className="mt-5 flex items-center gap-2 text-[12px]">
          <span className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-muted">
            template
          </span>
          <span className="text-muted">→</span>
          <span className="rounded-md border border-live/30 bg-live/10 px-2 py-1 font-mono text-live">
            deployed · 12s
          </span>
        </div>
      );
    case "resume":
      return (
        <div className="relative mt-5 rounded-lg border border-border bg-surface p-3 font-mono text-[10px]">
          <div className="h-1.5 w-16 rounded bg-foreground/50" />
          <div className="mt-2 h-1 w-24 rounded bg-foreground/20" />
          <div className="mt-2 h-1 w-40 rounded bg-foreground/12" />
          <div className="mt-2 h-1 w-32 rounded bg-foreground/12" />
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-live/12 px-2 py-0.5 text-[9px] font-semibold text-live">
            <Check size={10} strokeWidth={3} aria-hidden />
            ATS-ready
          </span>
        </div>
      );
    case "templates":
      return (
        <div className="mt-5 flex gap-2">
          {[
            { tone: "light", accent: "bg-accent/70" },
            { tone: "light", accent: "bg-foreground/40" },
            { tone: "dark", accent: "bg-white/70" },
          ].map((t, i) => (
            <div
              key={i}
              className={`flex-1 rounded-md border p-2 ${
                t.tone === "dark"
                  ? "border-foreground/20 bg-[#1c1a17]"
                  : "border-border bg-surface"
              }`}
            >
              {/* Avatar + heading */}
              <div className="flex items-center gap-2">
                <div
                  className={`h-4 w-4 shrink-0 rounded-full ${
                    t.tone === "dark"
                      ? "bg-white/20"
                      : "border border-accent/20 bg-accent/15"
                  }`}
                />

                <div className="flex-1">
                  {/* Small colored line */}
                  <div className={`h-1 w-1/3 rounded-full ${t.accent}`} />

                  {/* Bigger title line */}
                  <div
                    className={`mt-1 h-0.5 w-5/6 rounded-full ${
                      t.tone === "dark" ? "bg-white/20" : "bg-foreground/15"
                    }`}
                  />
                </div>
              </div>

              {/* Bottom content */}
              <div className="mt-2 space-y-1">
                <div
                  className={`h-0.5 w-full rounded-full ${
                    t.tone === "dark" ? "bg-white/20" : "bg-foreground/15"
                  }`}
                />
                <div
                  className={`h-0.5 w-3/4 rounded-full ${
                    t.tone === "dark" ? "bg-white/20" : "bg-foreground/15"
                  }`}
                />
                <div
                  className={`h-0.5 w-[60%] rounded-full ${
                    t.tone === "dark" ? "bg-white/20" : "bg-foreground/15"
                  }`}
                />
              </div>
            </div>
          ))}
        </div>
      );
    case "ownership":
      return (
        <div className="mt-5 rounded-lg border border-border bg-background/70 p-3 font-mono text-[11px] text-muted">
          <div>$ curl resfolio.me/you.json</div>
          <div className="text-live">↳ 200 OK · yours forever</div>
        </div>
      );
    default:
      return null;
  }
}

export default function Features() {
  return (
    <section
      id="features"
      data-testid={TEST_IDS.featuresSection}
      className="cv-auto relative border-t border-border py-24 md:py-32"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="max-w-2xl">
          <span className="label-eyebrow">Why Resfolio</span>
          <h2 className="mt-4 font-display text-4xl leading-[1.05] text-foreground md:text-6xl">
            Not another site builder.{" "}
            <span className="whitespace-nowrap italic text-accent">
              A career OS.
            </span>
          </h2>
        </div>

        <div className="mt-14 grid auto-rows-[minmax(240px,auto)] gap-4 md:grid-cols-3">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial="hidden"
              whileInView="visible"
              viewport={viewport}
              variants={fadeUp}
              transition={staggerTransition(i)}
              data-testid={`feature-${it.title
                .toLowerCase()
                .replace(/[^a-z]+/g, "-")
                .replace(/(^-|-$)/g, "")}`}
              className={`card-surface relative overflow-hidden p-6 transition hover:-translate-y-0.5 md:p-7 ${it.span ?? ""}`}
            >
              <div className="flex items-start justify-between">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-accent">
                  <it.Icon size={16} aria-hidden />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-6 font-display text-2xl leading-tight text-foreground md:text-3xl">
                {it.title}
              </h3>
              <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">
                {it.body}
              </p>
              <Demo kind={it.demo} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
