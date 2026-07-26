@AGENTS.md

# Resfolio Web Application

This application powers the public website.

Primary domain

https://resfolio.me

This application is responsible for

- Landing Page
- Features
- Pricing
- Integrations
- Documentation (future)
- Blog (future)
- Changelog (future)
- Careers (future)
- Legal Pages

This application is NOT the authenticated dashboard.

The dashboard lives in

apps/dashboard (https://app.resfolio.me)

---

# Mission

The landing page is the company's first impression.
Its purpose is to communicate Resfolio's value immediately.
Users should understand within a few seconds that

One Profile

↓

Resume

Portfolio

Personal Website

All generated from that one profile, and always up to date.

The landing page should communicate this visually before users begin reading.

Also refer to `design-refs/design_guidelines.json` for design guidelines;
visual references live in `design-refs/landing-page/` and
`design-refs/portfolio/`.

---

# Product Philosophy

Resfolio is not another resume builder.

Resfolio is a Professional Identity Platform.

Users maintain one profile.

Everything else is generated from that profile.

Never market Resfolio as a template marketplace.

Always communicate the single source of truth first: one profile the user
owns, from which every other surface is generated.

**Do not market Resfolio around "sync".** The earlier branding revolved
around "sync everything" ("Your Career, Synced.", "Update once. Everywhere
follows."); the product has moved on, and that copy was deliberately
removed. Avoid "sync", "synced", "in sync", "keep everything in sync", and
"one update, everywhere follows". The ideas that replace them: one
professional profile; resume and portfolio generated from one source;
publish everywhere; always up to date; your career represented
consistently; own your professional identity.

The voice is confident, not marketing-heavy — premium, clear within a few
seconds, developer-friendly without being overly technical.

---

# Technology

Framework

- Next.js App Router

Language

- TypeScript

Styling

- Tailwind CSS v4

Animation

- Framer Motion

Icons

- lucide-react
- react-icons

Images

- next/image

Always follow current official framework best practices.

Consult official documentation before implementing framework-specific features.

Never rely on outdated patterns.

---

# Component Architecture

Server Components are the default. A file only gets `"use client"` when it
genuinely needs one of: browser state (`useState`/`useEffect`), a scroll
listener, Framer Motion, or a Radix primitive. Concretely:

- `components/landing/hero.tsx`, `logos-strip.tsx`, `layout/footer.tsx`,
  `brand/resfolio-logo.tsx` — Server Components. The hero heading is the
  page's LCP element and must render/animate without client JS: its entrance
  motion is the CSS `animate-fade-up` / `animate-fade-scale` keyframes in
  `globals.css`, not Framer Motion.
- `components/landing/hero-graphic.tsx` — a small **client island** inside
  the (server) hero. It renders the "one source → resume / portfolio / API"
  visual with live-updating mini components driven by a single shared
  `setInterval`. It replaced an earlier SVG/SMIL + heavy-blur version that
  janked the whole page; keep this one cheap — transform/opacity + SVG
  stroke-dashoffset only, no `blur`, no `backdrop-filter`, no SMIL, and honor
  `prefers-reduced-motion`. Same rules apply to `preview.tsx`, which renders
  one profile object through several template layouts.
- `components/landing/how-it-works.tsx`, `integrations.tsx`, `features.tsx`,
  `preview.tsx`, `pricing.tsx` — Client Components, because they use real
  `whileInView` Framer Motion reveals. Below-the-fold, deferring to a client
  bundle is an acceptable trade-off; the shared `hidden`/`visible` variants,
  viewport options, and stagger helper live in `lib/motion.ts` so every
  section animates consistently instead of re-declaring the same objects.
- `components/landing/faq.tsx` is a Server Component that only holds the
  copy and JSON-LD; the Radix accordion is isolated in the client leaf
  `faq-accordion.tsx`. The primary CTA is
  `components/landing/get-started-button.tsx` — a Server-Component anchor to
  the dashboard (`DASHBOARD_URL` in `lib/links.ts`, a separate deployment),
  reused by the nav, hero and bottom CTA. It replaced the earlier waitlist
  email-capture form once the product went live; the `joinWaitlist` stub
  action and `waitlist-form.tsx` were removed with it.

When adding a new section, default to Server, and only reach for
`"use client"` once you hit one of the triggers above — not preemptively.

## Theme & tokens

The site uses a **warm-cream light theme**. Tailwind is v4, configured
CSS-first: the semantic `@theme` tokens, body base styles, focus/selection
rules, `.card-surface` classes, and shared entrance animations live in
**`@resfolio/design`** (`packages/design/src/index.css`), imported by
`app/globals.css` after `tailwindcss`. `app/globals.css` keeps only
marketing-specific rules (ambient wash, hero/marquee/accordion keyframes,
scroll behavior). Components consume the tokens (never hard-code hex or
`white/xx` for foreground):

- `background` (cream page), `surface` / `surface-warm` (cards),
  `foreground` (warm-near-black ink), `muted` (secondary text), `border`
  (warm hairline), `brand` / `brand-2` / `brand-3` / `brand-soft` (burnt
  orange), `live` (green).
- The brand colour is **`brand`**, not `accent` — it was renamed so that
  `accent` could mean shadcn's neutral hover surface in the dashboard. This
  app has no shadcn, but the token lives in the shared package, so use
  `text-brand` / `bg-brand` here too.
- Body text is `text-muted`; headings `text-foreground`; the orange `brand`
  is used sparingly (eyebrows, italic emphasis, primary CTAs, active states).
- Primary CTAs are solid `bg-brand text-white`; secondary actions are
  `border-border bg-surface`. Cards use the `.card-surface` /
  `.card-surface-warm` component classes (soft shadows, not glows).
- `text-white` / dark backgrounds appear only inside the deliberately-dark
  template previews (e.g. the "Terminal"/"Midnight" portfolio mocks).

There is no `tailwind.config.js`. The extraction into `@resfolio/design`
happened in Phase 1 (docs/DEVELOPMENT-PLAN.md); `apps/dashboard` consumes the same
package. Shared token or component-class changes go in the package — never
back into this app's globals.

---

# Design Philosophy

The landing page should feel like premium software.

Design inspiration

- Apple
- Linear
- Framer
- Vercel
- Stripe
- Arc Browser
- Raycast

Avoid

- Generic SaaS templates
- Bootstrap styling
- Canva-style marketing pages
- Excessive gradients
- Visual clutter

Every section should feel intentional.

Whitespace is part of the design.

Typography is part of the design.

Motion is part of the experience.

---

# Typography

Heading Font

Instrument Serif

Body Font

Manrope

Never replace these fonts unless branding changes.

Headings should remain elegant.

Avoid bold display typography.

Prefer generous whitespace over larger font weights.

# Components

The landing page should be built using reusable sections.

Examples

- Navigation
- Hero
- Social Proof
- Integrations
- How It Works
- Feature Grid
- Portfolio Preview
- Resume Preview
- Pricing
- FAQ
- CTA
- Footer

Each section should solve one problem.

Avoid unnecessary sections.

---

# Hero

The Hero is the most important section.

It should communicate

One Profile

↓

Resume

Portfolio

Website

All generated from that one profile, and always up to date.

The hero should tell this story visually.

Never depend only on text.

---

# Motion

Always use Framer Motion.

Motion should improve communication.

Prefer

- fade
- stagger
- spring
- shared layout transitions

Avoid

- excessive parallax
- random floating objects
- distracting animations
- animation without purpose

---

# Performance

Prefer Server Components.

Only use Client Components when necessary.

Use next/image.

Optimize fonts.

Optimize images.

Lazy load heavy components.

Keep JavaScript minimal.

Target

- Lighthouse 95+
- Excellent Core Web Vitals

Performance is a product feature.

---

# Accessibility

Use semantic HTML.
Support keyboard navigation.
Maintain WCAG AA contrast.
Provide visible focus states.
Every interactive element must include meaningful
data-testid
attributes.

---

# SEO

Every page should include

- Metadata
- Open Graph
- Twitter Cards
- Structured Data
- Canonical URLs

Maintain excellent Core Web Vitals.

---

# Code Quality

Prefer reusable components.
Avoid duplicated sections.
Extract repeated animations.
Strongly type everything.
Avoid any.
Keep components small.
Prefer composition over large components.

---

# Continuous Improvement

When a significantly better implementation is discovered

- Explain the reasoning.
- Explain tradeoffs.
- Recommend improvements.
- Update the nearest CLAUDE.md if conventions change.

When introducing new patterns or architectural decisions

- Keep CLAUDE.md synchronized.
- Keep README files synchronized.

---

# Quality Standard

Every page should feel polished.
Every interaction should feel intentional.
Every animation should improve understanding.
Every section should communicate value.
The website should feel closer to a premium product launch than a typical SaaS landing page.
Before considering a feature complete, ask

- Can this be simpler?
- Can this feel more premium?
- Does this improve clarity?
- Does this improve conversion?
- Would companies like Linear, Vercel, Framer, or Apple ship this experience?

If not, continue improving it.
