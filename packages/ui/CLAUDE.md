# @resfolio/ui — shared UI primitives

The dashboard's **shadcn/ui foundation** (docs/architecture/08-dashboard-ux.md).
`apps/dashboard` is the only real consumer — `apps/web` declares the dependency
but imports nothing from it and stays fully custom.

The package ships **source**, not a build (`exports: { ".": "./src/index.ts" }`),
so consuming apps must scan it for Tailwind classes:
`@source "../../../packages/ui/src";` in their `globals.css`.

## The bar: upstream shadcn, restyled — never reinvented

**Start from the official implementation and customise on top of it.** A
component written from scratch to _look_ like shadcn will drift on behaviour,
and the divergence surfaces as accessibility and state bugs long after the
visual match is accepted. Three components learned this the hard way
(2026-07-18): `Label`, `Checkbox` and `Switch` were native elements styled with
`peer-*`, and each lost something real — `Checkbox` had no reachable
indeterminate state, `Switch` announced itself as a checkbox and had to
re-draw its own focus ring from a sibling because the focusable element was
`sr-only`, `Label` didn't suppress double-click text selection. All three are
now on Radix, and **their API changed with them**: `onCheckedChange(checked)`,
not `onChange(event)`.

- **Upstream shadcn, Resfolio tokens**: `Button`, `Input`, `Textarea`, `Label`,
  `Checkbox`, `Switch`, `Card`. Upstream's structure, `data-slot`, variant
  vocabulary and behaviour; our palette, radii and type ramp. `Button` uses
  shadcn's own names (`default | destructive | outline | secondary | ghost |
link`, `default | sm | lg | icon`) plus an `icon-sm` addition the registry
  asks for by name. Documented divergences are commented **in the file** with
  the reason — `rounded-full` (Resfolio's button shape), `default` mapping to
  `bg-brand` rather than the bridge's ink `primary`, `Card` carrying no root
  padding (13 call sites already pass their own), and no shadow on `Card`
  (doc 08: hairline borders over shadows).
- **Genuinely ours** (no upstream equivalent): `TagInput`, `Spinner`,
  `MonthYearPicker`.
- **Do not let the CLI overwrite the customised files** — see below.
- **Straight from the registry**: `Sidebar`, `Sheet`, `Tooltip`, `Separator`,
  `Skeleton`, `Select`, `Dialog`, `Command`, `DropdownMenu`, `Popover`
  (restyled onto this app's surface + `animate-popover-in` motion, since the
  registry's `tailwindcss-animate` classes don't exist here).
- **Composed from those**: `MonthYearPicker` — month + year, never a day. No
  career fact this product collects is precise to the day, and a full calendar
  invites a precision the resume then throws away. `Popover` on pointer
  devices, `Dialog` on mobile (`useIsMobile`), because a 260px popover anchored
  to a field near the bottom of a phone viewport is unusable. Value in/out is
  `""` or `YYYY-MM`; `min`/`max` **disable** out-of-range cells rather than
  validating after the fact, and they work as plain string comparisons because
  `YYYY-MM` sorts in date order.

Both are exported from `src/index.ts`. Apps import from `"@resfolio/ui"` only,
never an internal path (root CLAUDE.md → Imports).

`Spinner` is **the** loading indicator — lucide's `Loader2` + `animate-spin` is
gone from the dashboard and should not come back. Its twelve bars are CSS
(`.spinner` / `.spinner-bar` in `@resfolio/design`), sized proportionally so the
whole size lives in the root element's `size-*`, and painted with
`currentColor`, so it inherits its context's text colour and is correct in dark
mode with nothing passed. Two things to know at a call site:

- **`Button`'s icon sizing does not reach it.** The variants target `[&_svg]`
  and this is a `div`, so a spinner in a `size="sm"` button needs
  `size="sm"` explicitly. Default `md` matches `md`/`lg`/`icon`.
- **It is decorative by default** (`aria-hidden`). Pass `label` only when the
  spinner is the sole indication that something is loading — adjacent text
  ("Saving…") or an enclosing live region already says it, and a second
  announcement is noise.

## Adding a component from the registry

```bash
yes n | pnpm dlx shadcn@latest add <name> -c packages/ui
```

Then, **every time**:

1. **Verify the customised files survived.** The CLI prompts
   `"<file> already exists. Would you like to overwrite?"` for `button.tsx` /
   `input.tsx`. `-y` does **not** suppress it and the prompt cannot be answered
   from a non-TTY — the run just aborts. `yes n |` answers no. Since the
   variant vocabulary now matches upstream (2026-07-18), an overwrite costs the
   Resfolio styling rather than the API — it shows up as square grey buttons,
   not a type error, so check visually and not just with `tsc`.
2. **Rewrite `@/` imports to relative.** `components.json` declares `@/…`
   aliases so the CLI knows where to write, and `tsconfig.json` resolves them —
   but this package's source must not use them: it ships to apps whose own `@/`
   points at their own root, so `@/components/button` would resolve to
   _the consumer's_ tree. Convert: `@/components/x` → `./x`, `@/lib/cn` →
   `../lib/cn`, `@/hooks/x` → `../hooks/x`.
3. **Check the token vocabulary** (below), then export from `src/index.ts`.
4. **Install deps yourself** — the CLI does not add them here. Registry
   components import from the unified `radix-ui` package; the hand-authored
   ones use individual `@radix-ui/react-*`. Both are dependencies; that split
   is expected, not a mistake to "fix".

`style: "radix-nova"` in `components.json` encodes the base — there is no
separate `base` field, and getting that wrong makes the CLI reject the config
with only "Invalid configuration found".

## Theming: the bridge, not the file

Registry components are themed by **`@resfolio/design/shadcn`** — a token
bridge mapping shadcn's vocabulary (`bg-primary`, `bg-card`, `hover:bg-accent`,
`bg-sidebar`) onto Resfolio's. **Do not edit an added component to restyle
it.** That is what keeps `shadcn diff` usable and what stops every upgrade
costing a manual pass.

Two things the bridge cannot express, both already handled:

- **`bg-muted`** — shadcn's `muted` is a pale _surface_; ours is the secondary
  _text_ colour (212 call sites), and Tailwind generates both utilities from
  one token. If a registry component uses `bg-muted`, swap it to
  `bg-surface-warm` and say why in the file (see `skeleton.tsx`). This is rare:
  shadcn nearly always wants `muted-foreground`.
- **A genuine upstream bug.** `sidebar.tsx` ships `data-active={isActive}`;
  React renders `data-*` booleans as strings, so `false` becomes
  `data-active="false"` — _present_ — and Tailwind v4's `data-active:` variant
  matches presence. Every menu button wore the active background. Fixed to
  `isActive || undefined`. If you re-add `sidebar`, re-apply it.

Anything else that looks like it needs an edit is probably a missing bridge
token. Add it to `@resfolio/design/shadcn`, pointing at an existing Resfolio
token — the bridge declares no colours of its own.

`Button` carries an `icon-sm` size purely because registry components ask for
it by name. Keeping our primitives compatible with what the registry expects is
cheaper than editing what the registry ships.

## Rules

- **No `"use client"` unless the behavior forces it** (Radix, or `TagInput`'s
  pending-text state). These render inside Server Components in both apps;
  keep interaction feedback in CSS rather than reaching for a motion library
  (`Button`'s press is `active:scale-*`, deliberately).
- Semantic token utilities only (`bg-surface`, `text-muted`, `border-border`,
  `text-brand`) — never a hard-coded hex. The brand colour is **`brand`**, not
  `accent`: `accent` belongs to shadcn's hover surface (doc 08).
- Add primitives when a feature needs one, never speculatively.
