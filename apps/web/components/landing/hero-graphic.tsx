"use client";

import { useEffect, useState } from "react";
import { TEST_IDS } from "@/lib/testids";
import Image from "next/image";

/**
 * Hero visual — a live preview of the product. One central Profile (the
 * source of truth) is wired by soft curved connectors to three real-looking
 * outputs that all read the SAME data and update together:
 *   • Portfolio — a polished portfolio-site preview
 *   • Resume    — an ATS-ready resume with an experience section
 *   • API       — a live JSON response
 *
 * Layout is a container-query grid sized in `cqi` units, so the entire
 * composition scales proportionally from mobile to desktop without breaking.
 *
 * Performance: ONE shared interval drives every live value; motion is
 * transform/opacity + a small blur focus-in + SVG stroke-dashoffset only.
 * No backdrop-filter, no SMIL. Honors prefers-reduced-motion.
 */

const NAME = "Alex Morgan";
const AGE = 29;
const ROLES = [
  "Senior Product Designer",
  "Design Systems Lead",
  "Staff Product Designer",
];
const IMAGES = [
  "https://api.dicebear.com/10.x/micah/svg?seed=a5th9dn1",
  "https://api.dicebear.com/10.x/micah/svg?clothesVariant=open&earringsVariant=hoop&earringsProbability=32&earsVariant=detached&glassesVariant=square&glassesProbability=100&hairVariant=dougFunny&hairProbability=100&seed=a5th9dn1",
  "https://api.dicebear.com/10.x/micah/svg?clothesVariant=crew&earringsVariant=hoop&earringsProbability=32&earsVariant=detached&glassesVariant=square&glassesProbability=100&hairVariant=fonze&hairProbability=100&seed=a5th9dn1",
];
const EXPERIENCE = [
  { role: "Senior Product Designer", org: "Framer", period: "2022 — Now" },
  { role: "Product Designer", org: "Stripe", period: "2019 — 22" },
];
const PROJECTS = [
  { name: "Fjord", grad: "from-brand/30 to-brand/5" },
  { name: "Pulse", grad: "from-[#7d8fc9]/30 to-[#7d8fc9]/5" },
  { name: "Halo", grad: "from-live/30 to-live/5" },
];

/* Mobile (grid) connectors — subtle, only seen in the tight gaps. */
const MOBILE_WIRES = [
  "M24 18 C 42 9, 52 34, 74 28",
  "M22 20 C 15 38, 31 50, 26 64",
  "M26 21 C 45 48, 58 66, 74 80",
];

/* Desktop (organic) connectors — routed through the open channels between
   the offset cards so the whole line reads, each flowing independently. */
const DESKTOP_WIRES = [
  { d: "M40 12 C 46 9, 49 14, 53 15", dur: "1s", delay: "0s" }, // → portfolio
  { d: "M20 25 C 18 30, 16 34, 16 37", dur: "1.35s", delay: "0.3s" }, // → resume
  { d: "M40 20 C 53 33, 46 57, 55 74", dur: "1.7s", delay: "0.55s" }, // → api
];
const DESKTOP_NODES = [
  { x: 53, y: 15 },
  { x: 16, y: 37 },
  { x: 55, y: 74 },
];

export default function HeroGraphic() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 2800);
    return () => window.clearInterval(id);
  }, []);

  const role = ROLES[tick % ROLES.length]!;
  const image = IMAGES[tick % ROLES.length]!;
  const theme = tick % 3;
  const updatedAgo = (tick % 9) + 1;

  return (
    <div
      data-testid={TEST_IDS.heroSignalGraph}
      role="img"
      aria-label="Your Resfolio profile powering a live resume, portfolio site and public API"
      className="@container relative aspect-9/10 w-full select-none lg:aspect-10/11"
    >
      {/* Mobile connectors (grid layout) — subtle, seen through the gaps. */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 z-0 h-full w-full lg:hidden"
      >
        {MOBILE_WIRES.map((d) => (
          <g key={d}>
            <path
              d={d}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="1.4"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={d}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth="1.4"
              strokeDasharray="2 7"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="rf-dash"
              opacity="0.9"
            />
          </g>
        ))}
      </svg>

      {/* Desktop connectors (organic layout) — a faint solid track keeps the
          whole connection readable; a brighter dash flows over it. Each wire
          animates independently for a living-system feel. */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 z-0 hidden h-full w-full lg:block"
      >
        {DESKTOP_WIRES.map((w) => (
          <g key={w.d}>
            <path
              d={w.d}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth="1.1"
              vectorEffect="non-scaling-stroke"
              opacity="0.32"
            />
            <path
              d={w.d}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth="1.5"
              strokeDasharray="2 6"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="rf-dash"
              style={{ animationDuration: w.dur, animationDelay: w.delay }}
            />
          </g>
        ))}
      </svg>

      {/* Desktop connection nodes — sit on the card edges as data ports. */}
      {DESKTOP_NODES.map((n) => (
        <span
          key={`${n.x}-${n.y}`}
          aria-hidden
          className="absolute z-20 hidden h-[1.5cqi] w-[1.5cqi] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_0_2.5px_var(--color-background)] lg:block"
          style={{ left: `${n.x}%`, top: `${n.y}%` }}
        />
      ))}

      <div className="relative z-10 grid h-full grid-cols-2 grid-rows-3 gap-[2.4cqi] lg:block">
        {/* ── Source: profile hub (top-left) ─────────────────────────── */}
        <div className="col-start-1 row-start-1 flex min-w-0 flex-col justify-between gap-[2cqi] rounded-[2cqi] border border-border bg-surface p-[2.6cqi] shadow-[0_6px_18px_rgba(38,32,25,0.06)] lg:absolute lg:left-[5%] lg:top-[2%] lg:w-[35%] lg:-rotate-1">
          <div className="flex items-center gap-[1.6cqi]">
            <div className="relative h-[7cqi] w-[7cqi] shrink-0 overflow-hidden rounded-full border border-border bg-brand/12">
              <Image
                src={image}
                alt={NAME}
                fill
                sizes="64px"
                className="object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[2.7cqi] font-semibold leading-tight text-foreground">
                {NAME}
              </p>
              <p className="truncate text-[1.9cqi] text-muted">your profile</p>
            </div>
          </div>
          <div className="flex items-center gap-[1.4cqi] text-[2.1cqi]">
            <span className="shrink-0 text-muted">role</span>
            <span
              key={role}
              className="animate-focus-in truncate font-medium text-foreground"
            >
              {role}
              <span className="rf-caret ml-[0.4cqi] inline-block h-[2.2cqi] w-px translate-y-[0.3cqi] bg-brand align-middle" />
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-[1.6cqi] text-[1.9cqi]">
            <span className="text-muted">source of truth</span>
            <span className="inline-flex items-center gap-[1cqi] text-live">
              <span className="h-[1.5cqi] w-[1.5cqi] rounded-full bg-live rf-pulse-soft" />
              live
            </span>
          </div>
        </div>

        {/* ── Output: portfolio (right, tall) ────────────────────────── */}
        {theme === 0 && <Template1 role={role} image={image} />}
        {theme === 1 && <Template2 role={role} image={image} />}
        {theme === 2 && <Template3 role={role} image={image} />}

        {/* ── Output: resume (left, tall) ────────────────────────────── */}
        <div className="col-start-1 row-span-2 row-start-2 flex min-w-0 flex-col overflow-hidden rounded-[2cqi] border border-border bg-surface p-[2.6cqi] shadow-[0_10px_26px_rgba(38,32,25,0.10)] lg:absolute lg:left-[1%] lg:top-[37%] lg:w-[45%] lg:rotate-[-1.5deg]">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-[1cqi] rounded-full bg-live/12 px-[1.6cqi] py-[0.5cqi] text-[1.8cqi] font-semibold text-live">
              <span className="h-[1.4cqi] w-[1.4cqi] rounded-full bg-live" />
              ATS-friendly
            </span>
            <span className="font-mono text-[1.8cqi] uppercase tracking-wider text-muted">
              resume.pdf
            </span>
          </div>

          <p className="mt-[2cqi] font-display text-[3.6cqi] leading-tight text-foreground">
            {NAME}
          </p>
          <p
            key={role}
            className="animate-focus-in truncate text-[2.2cqi] text-muted"
          >
            {role}
          </p>

          <div className="mt-[2.2cqi] border-t border-border pt-[1.8cqi]">
            <p className="text-[1.8cqi] font-semibold uppercase tracking-[0.18em] text-brand">
              Experience
            </p>
            <div className="mt-[1.6cqi] flex flex-col gap-[2cqi]">
              {EXPERIENCE.map((e) => (
                <div key={e.org} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-[1.4cqi]">
                    <span className="truncate text-[2.3cqi] font-medium text-foreground">
                      {e.role}
                    </span>
                    <span className="shrink-0 font-mono text-[1.8cqi] text-muted">
                      {e.period}
                    </span>
                  </div>
                  <p className="text-[2cqi] text-muted">{e.org}</p>
                  <div className="mt-[1cqi] h-[0.9cqi] w-[80%] rounded-full bg-foreground/8" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Output: API (bottom-right) ─────────────────────────────── */}
        <div className="col-start-2 row-start-3 flex min-w-0 flex-col justify-center overflow-hidden rounded-[2cqi] border border-border bg-surface p-[2.4cqi] shadow-[0_6px_18px_rgba(38,32,25,0.06)] lg:absolute lg:left-[55%] lg:top-[66%] lg:w-[48%] lg:rotate-2">
          <div className="mb-[1.4cqi] flex items-center justify-between">
            <span className="font-mono text-[1.8cqi] uppercase tracking-wider text-muted">
              GET /api/me
            </span>
            <span className="rounded bg-live/12 px-[1cqi] font-mono text-[1.7cqi] font-semibold text-live">
              200
            </span>
          </div>
          <pre className="whitespace-pre-wrap break-all font-mono text-[1.9cqi] leading-[1.6] text-muted">
            <span className="text-foreground/50">{"{"}</span>
            {"\n  "}
            <span className="text-brand">&quot;name&quot;</span>:{" "}
            <span className="text-live">&quot;{NAME}&quot;</span>,{"\n  "}
            <span className="text-brand">&quot;age&quot;</span>:{" "}
            <span className="text-foreground/70">{AGE}</span>,{"\n  "}
            <span className="text-brand">&quot;role&quot;</span>:{" "}
            <span key={role} className="animate-focus-in text-live">
              &quot;{role}&quot;
            </span>
            ,{"\n  "}
            <span className="text-brand">&quot;updated&quot;</span>:{" "}
            <span className="text-foreground/70">&quot;{updatedAgo}s ago&quot;</span>
            {"\n"}
            <span className="text-foreground/50">{"}"}</span>
          </pre>
        </div>
      </div>
    </div>
  );
}

const Template1 = ({ role, image }: { role: string; image: string }) => {
  return (
    <div className="col-start-2 row-span-2 row-start-1 flex min-w-0 flex-col overflow-hidden rounded-[2cqi] border border-border bg-surface shadow-[0_10px_26px_rgba(38,32,25,0.10)] lg:absolute lg:left-[53%] lg:top-0 lg:w-[46%] lg:rotate-1">
      {/* browser chrome */}
      <div className="flex items-center gap-[1.4cqi] border-b border-border px-[2.2cqi] py-[1.6cqi]">
        <span className="flex gap-[0.8cqi]">
          <span className="h-[1.4cqi] w-[1.4cqi] rounded-full bg-foreground/15" />
          <span className="h-[1.4cqi] w-[1.4cqi] rounded-full bg-foreground/15" />
          <span className="h-[1.4cqi] w-[1.4cqi] rounded-full bg-foreground/15" />
        </span>
        <span className="ml-auto inline-flex items-center gap-[1cqi] rounded-full border border-border px-[1.6cqi] py-[0.4cqi] font-mono text-[1.7cqi] text-muted">
          <span className="h-[1.2cqi] w-[1.2cqi] rounded-full bg-live" />
          alex.dev
        </span>
      </div>
      {/* hero band */}
      <div className="relative bg-linear-to-br from-brand/12 to-transparent px-[2.6cqi] pb-[2.4cqi] pt-[2.8cqi]">
        <span className="relative grid h-[9cqi] w-[9cqi] overflow-hidden rounded-full border border-border bg-surface">
          <Image
            src={image}
            alt={NAME}
            fill
            sizes="80px"
            className="rounded-full object-contain"
          />
        </span>
        <p className="mt-[1.6cqi] font-display text-[4.6cqi] leading-[1.05] text-foreground">
          {NAME}
        </p>
        <p
          key={role}
          className="animate-focus-in truncate text-[2.2cqi] text-muted"
        >
          {role}
        </p>
      </div>
      {/* work grid */}
      <div className="flex flex-1 flex-col justify-end gap-[1.6cqi] px-[2.6cqi] pb-[2.6cqi]">
        <p className="text-[1.8cqi] uppercase tracking-[0.2em] text-muted">
          Selected work
        </p>
        <div className="grid grid-cols-3 gap-[1.6cqi]">
          {PROJECTS.map((p) => (
            <div key={p.name} className="min-w-0">
              <div
                className={`aspect-4/3 rounded-[1.4cqi] border border-border bg-linear-to-br ${p.grad}`}
              />
              <p className="mt-[0.8cqi] truncate text-[1.8cqi] text-foreground/80">
                {p.name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Template2 = ({ role, image }: { role: string; image: string }) => {
  return (
    <div className="col-start-2 row-span-2 row-start-1 flex min-w-0 flex-col overflow-hidden rounded-[2cqi] border border-neutral-800 bg-neutral-950 text-white shadow-[0_10px_26px_rgba(0,0,0,0.45)] lg:absolute lg:left-[53%] lg:top-0 lg:w-[46%] lg:rotate-1">
      {/* Browser chrome */}
      <div className="flex items-center gap-[1.4cqi] border-b border-neutral-800 bg-neutral-900 px-[2.2cqi] py-[1.6cqi]">
        <span className="flex gap-[0.8cqi]">
          <span className="h-[1.4cqi] w-[1.4cqi] rounded-full bg-red-500" />
          <span className="h-[1.4cqi] w-[1.4cqi] rounded-full bg-yellow-500" />
          <span className="h-[1.4cqi] w-[1.4cqi] rounded-full bg-green-500" />
        </span>

        <span className="ml-auto inline-flex items-center gap-[1cqi] rounded-[0.8cqi] border border-neutral-700 bg-neutral-950 px-[1.6cqi] py-[0.4cqi] font-mono text-[1.7cqi] text-neutral-400">
          ~/alex.dev
        </span>
      </div>

      {/* Hero */}
      <div className="flex flex-col items-center px-[2.6cqi] pb-[2cqi] pt-[2.2cqi]">
        <span className="grid h-[8cqi] w-[8cqi] place-items-center rounded-[1.4cqi] border border-neutral-700 bg-neutral-900 font-display text-[4.4cqi] font-semibold text-green-400">
          <Image
            src={image}
            width={50}
            height={50}
            className="w-full h-full"
            alt={image}
          />
        </span>

        <p className="mt-[1.6cqi] text-center font-display text-[4.6cqi] leading-[1.05] text-white">
          {NAME}
        </p>

        <p
          key={role}
          className="animate-focus-in mt-[0.8cqi] text-center text-[2.2cqi] text-neutral-400"
        >
          {role}
        </p>
      </div>

      {/* Projects */}
      <div className="flex flex-1 flex-col px-[2.6cqi] pb-[2.6cqi]">
        <div className="mb-[1.6cqi] flex items-center justify-between">
          <p className="font-mono text-[1.8cqi] uppercase tracking-[0.25em] text-neutral-500">
            Featured Projects
          </p>

          <span className="rounded-[0.8cqi] bg-green-500/15 px-[1cqi] py-[0.2cqi] font-mono text-[1.5cqi] text-green-400">
            4
          </span>
        </div>

        <div className="grid grid-cols-2 gap-[1.6cqi]">
          {PROJECTS.slice(0, 2).map((p) => (
            <div
              key={p.name}
              className="flex h-fit flex-col rounded-[1.4cqi] border border-neutral-800 bg-neutral-900 p-[1.2cqi]"
            >
              <div className="aspect-8/3 rounded-[0.9cqi] bg-linear-to-br from-neutral-700 to-neutral-800" />

              <div className="mt-[0.5cqi]">
                <p className="truncate text-[1.8cqi] font-medium text-neutral-100">
                  {p.name}
                </p>

                <div className="mt-[0.6cqi] h-[0.7cqi] w-[70%] rounded-full bg-neutral-700" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Template3 = ({ role, image }: { role: string; image: string }) => {
  return (
    <div className="col-start-2 row-span-2 row-start-1 flex min-w-0 flex-col overflow-hidden rounded-[2cqi] border border-border bg-surface shadow-[0_10px_26px_rgba(38,32,25,0.10)] lg:absolute lg:left-[53%] lg:top-0 lg:w-[46%] lg:rotate-1">
      {/* Browser chrome */}
      <div className="border-b border-border bg-linear-to-r from-violet-500/10 via-sky-500/10 to-cyan-500/10 px-[2.2cqi] py-[1.6cqi]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[1.7cqi] uppercase tracking-[0.2em] text-muted">
            Portfolio
          </span>

          <span className="rounded-[0.4cqi] bg-brand/10 px-[1.2cqi] py-[0.4cqi] font-mono text-[1.6cqi] text-brand">
            v3
          </span>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-linear-to-br from-violet-500/12 via-transparent to-sky-500/10 px-[2.6cqi] pb-[2.2cqi] pt-[2.6cqi]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[1.7cqi] uppercase tracking-[0.25em] text-muted">
              Product Designer
            </p>

            <p className="mt-[0.8cqi] font-display text-[4.6cqi] leading-[1.05] text-foreground">
              {NAME}
            </p>

            <p
              key={role}
              className="animate-focus-in mt-[0.8cqi] text-[2.2cqi] text-muted"
            >
              {role}
            </p>
          </div>

          <span className="grid h-[9cqi] w-[9cqi] place-items-center rounded-[0.8cqi] border border-border bg-white/70 font-display text-[4.2cqi] text-brand">
            <Image
              src={image}
              width={50}
              height={50}
              className="w-full h-full"
              alt={image}
            />
          </span>
        </div>
      </div>

      {/* Featured work */}
      <div className="flex flex-1 flex-col gap-[1.6cqi] px-[2.6cqi] pb-[2.6cqi]">
        <div className="flex items-center justify-between">
          <p className="text-[1.8cqi] font-semibold uppercase tracking-[0.18em] text-muted">
            Featured Work
          </p>

          <div className="h-[0.8cqi] w-[8cqi] rounded-full bg-brand/20" />
        </div>

        {/* Bottom cards */}
        <div className="grid grid-cols-2 gap-[1.6cqi]">
          {PROJECTS.slice(1).map((p) => (
            <div
              key={p.name}
              className="rounded-[0.6cqi] border border-border p-[1.4cqi]"
            >
              <div
                className={`aspect-4/3 rounded-[0.3cqi] bg-linear-to-br ${p.grad}`}
              />

              <p className="mt-[0.8cqi] text-[1.8cqi] font-medium text-foreground">
                {p.name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
