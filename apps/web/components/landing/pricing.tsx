"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { fadeUp, staggerTransition, viewport } from "@/lib/motion";
import { TEST_IDS } from "@/lib/testids";

type Tier = {
  name: string;
  price: string;
  per?: string;
  caption: string;
  cta: string;
  highlight?: boolean;
  features: string[];
};

const tiers: Tier[] = [
  {
    name: "Solo",
    price: "Free",
    caption: "Forever, no card.",
    cta: "Start free",
    features: [
      "resfolio.me/handle URL",
      "2 connected sources",
      "1 portfolio theme",
      "PDF resume export",
    ],
  },
  {
    name: "Pro",
    price: "$8",
    per: "/mo",
    caption: "For working professionals.",
    cta: "Get Pro",
    highlight: true,
    features: [
      "Custom domain + HTTPS",
      "All 5 sources synced",
      "All themes + custom CSS",
      "ATS-friendly resume variants",
      "Public JSON API",
      "Priority sync",
    ],
  },
  {
    name: "Studio",
    price: "$24",
    per: "/mo",
    caption: "For freelancers & studios.",
    cta: "Talk to us",
    features: [
      "Up to 5 portfolios / clients",
      "Team seats & handoff",
      "White-label domain",
      "Analytics & lead capture",
      "Priority support",
    ],
  },
];

export default function Pricing() {
  return (
    <section
      id="pricing"
      data-testid={TEST_IDS.pricingSection}
      className="cv-auto relative border-t border-border py-24 md:py-32"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-14 flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <span className="label-eyebrow">Pricing</span>
            <h2 className="mt-4 max-w-xl font-display text-4xl leading-[1.02] text-foreground md:text-6xl">
              Cheaper than the domain you keep renewing.
            </h2>
          </div>
          <p className="max-w-sm text-[15px] text-muted">
            Simple, fair pricing. Cancel anytime. Every plan includes free
            hosting on resfolio.me.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {tiers.map((t, i) => (
            <motion.div
              key={t.name}
              initial="hidden"
              whileInView="visible"
              viewport={viewport}
              variants={fadeUp}
              transition={staggerTransition(i, { base: 0.08 })}
              data-testid={`pricing-tier-${t.name.toLowerCase()}`}
              className={`relative flex flex-col p-8 ${
                t.highlight ? "card-surface-warm" : "card-surface"
              }`}
            >
              {t.highlight && (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-white shadow-[0_6px_24px_rgba(240,89,43,0.35)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  most popular
                </span>
              )}

              <div className="flex items-baseline justify-between">
                <h3 className="font-display text-3xl text-foreground">
                  {t.name}
                </h3>
                <div>
                  <span className="font-display text-4xl text-foreground">
                    {t.price}
                  </span>
                  {t.per && <span className="text-sm text-muted">{t.per}</span>}
                </div>
              </div>
              <p className="mt-1 text-[13px] text-muted">{t.caption}</p>

              <ul className="mt-6 flex-1 space-y-3">
                {t.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-[14px] text-foreground/80"
                  >
                    <Check
                      size={16}
                      strokeWidth={2.5}
                      aria-hidden
                      className="mt-0.5 shrink-0 text-accent"
                    />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href="#waitlist"
                data-testid={`pricing-cta-${t.name.toLowerCase()}`}
                className={`mt-8 inline-flex h-11 items-center justify-center rounded-full px-5 text-[13px] font-semibold transition ${
                  t.highlight
                    ? "bg-accent text-white shadow-[0_10px_30px_rgba(240,89,43,0.3)] hover:bg-accent-soft"
                    : "border border-border bg-surface text-foreground hover:border-foreground/30"
                }`}
              >
                {t.cta} →
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
