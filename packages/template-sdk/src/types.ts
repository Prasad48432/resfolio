import type { ReactElement } from "react";
import type { z } from "zod";

import type { ProfileView } from "@resfolio/profile";

/**
 * The Template SDK contract types (docs/architecture/05-template-sdk.md).
 * Templates depend on this package and *nothing else platform-side*; the
 * platform (dashboard, apps/sites, PDF pipeline) consumes templates only
 * through these types. This single choke point is what makes the platform
 * evolvable without auditing every template.
 */

/** The `ProfileView` major this SDK builds and templates target. Additive by
 * policy (doc 05): new fields may appear, existing fields never change
 * meaning within a major, so the storage schema can churn underneath. */
export const PROFILE_VIEW_VERSION = 1;

/** The SDK contract major itself. */
export const SDK_VERSION = 1;

/** Re-exported so templates import the view contract from the SDK only. */
export type { ProfileView } from "@resfolio/profile";

export type PageSize = "A4" | "LETTER";

/** The two output kinds. `resume` renders a single paginated document;
 * `portfolio` renders a multi-page website (doc 03). New kinds (cover letter,
 * OG card) slot into the discriminated union without reshaping either. */
export type TemplateKind = "resume" | "portfolio";

/** Platform-owned portfolio page kinds — the route table in doc 04
 * (`/`, `/projects`, `/projects/[slug]`, `/about`, `/resume`, `/blog`,
 * `/blog/[slug]`). Routes are a *platform* concept so URLs stay stable across
 * template switches; a template declares which it supports via
 * `capabilities.pages` and the platform routes around the rest (404 / redirect
 * home). `home` is mandatory for every portfolio template. */
export const PORTFOLIO_PAGE_KINDS = [
  "home",
  "projects",
  "projectDetail",
  "about",
  "resume",
  "blog",
  "blogPost",
] as const;
export type PortfolioPageKind = (typeof PORTFOLIO_PAGE_KINDS)[number];

/** Contract versions a template was authored against (doc 05). The platform
 * refuses to render a template whose `compat` it can't satisfy. */
export interface TemplateCompat {
  profileView: number;
  sdk: number;
}

/** Theme tokens are CSS custom properties in the `--rf-*` namespace. A
 * template ships one or more named presets; the platform resolves the active
 * preset + the user's customizable-token overrides into a flat map applied as
 * inline `style` on the render root. Templates read tokens via `var(--rf-*)`,
 * never hard-coded values. */
export type TokenName = `--rf-${string}`;
export type ThemeTokens = Partial<Record<TokenName, string>>;

export interface ThemePreset {
  id: string;
  name?: string;
  tokens: ThemeTokens;
}

/** A resolved, flattened token map ready to serialize to `style`. */
export type ResolvedTheme = ThemeTokens;

export interface ResumeCapabilities {
  /** Renders semantic, single-flow, extractable HTML (doc 02). */
  atsSafe: boolean;
  pageSizes: readonly PageSize[];
}

/** Exactly what a resume renderer receives — validated, resolved, read-only.
 * Renderers never fetch data, read the database, or import from `domains/*`. */
export interface ResumeDocumentProps<Config> {
  view: ProfileView;
  config: Config;
  theme: ResolvedTheme;
}

/** A resume renderer is a **universal component** (doc 05): server-first (no
 * `"use client"`), written without server-only APIs so the dashboard can
 * render it client-side for keystroke-latency preview. Resume renderers lay
 * out with zero client JS. */
export type ResumeRenderer<Config> = (
  props: ResumeDocumentProps<Config>,
) => ReactElement | null;

/** What a resume template author passes to `defineTemplate`. */
export interface ResumeTemplateDefinition<Config> {
  kind: "resume";

  // Identity
  /** Permanent, unique, kebab-case. */
  id: string;
  /** Semver; Sites pin `templateId@major` (doc 07). */
  version: string;
  compat: TemplateCompat;

  // Metadata (dashboard gallery)
  name: string;
  description: string;
  /** Static preview asset path/URL (optional until the gallery ships). */
  preview?: string;

  // Configuration
  configSchema: z.ZodType<Config>;
  defaultConfig: Config;
  themes: readonly ThemePreset[];
  /** Tokens the user may override; must exist in every theme preset. */
  customizableTokens?: readonly TokenName[];

  // Capabilities — declarative feature support (doc 05)
  capabilities: ResumeCapabilities;

  // Renderer
  document: ResumeRenderer<Config>;
}

export interface PortfolioCapabilities {
  /** Which platform page kinds this template renders. Must be non-empty and
   * must include `home`; every listed page needs a renderer in `pages`
   * (enforced by `defineTemplate`). */
  pages: readonly PortfolioPageKind[];
}

/** Exactly what a portfolio page renderer receives — validated, resolved,
 * read-only. Beyond the shared `{ view, config, theme }`:
 * - `params` — the matched platform route params (e.g. `{ slug }` for
 *   `projectDetail` / `blogPost`); index pages receive an empty object.
 * - `basePath` — the site root the template prefixes onto inter-page links
 *   (e.g. `/p/ada`, no trailing slash). Routing is platform-owned so URLs
 *   stay stable across template switches (doc 04); the template never
 *   hard-codes a username or base. Build links as
 *   `` `${basePath}/projects` `` etc.
 *
 * Renderers never fetch data, read the database, or import from `domains/*`. */
export interface PortfolioPageProps<Config> {
  view: ProfileView;
  config: Config;
  theme: ResolvedTheme;
  params: Record<string, string>;
  basePath: string;
}

/** A portfolio page renderer is a **universal component** (doc 05):
 * server-first (no `"use client"`), rendered as an RSC on `apps/sites` and in
 * the draft-preview iframe. Portfolio templates may layer client islands for
 * motion/interactivity on top, unlike resume renderers. */
export type PortfolioPageRenderer<Config> = (
  props: PortfolioPageProps<Config>,
) => ReactElement | null;

/** What a portfolio template author passes to `defineTemplate`. Mirrors the
 * resume definition's identity/config/theme surface; differs in `capabilities`
 * (a page list, not ATS/page sizes) and in shipping a `pages` renderer map
 * instead of a single `document`. */
export interface PortfolioTemplateDefinition<Config> {
  kind: "portfolio";

  // Identity
  /** Permanent, unique, kebab-case. */
  id: string;
  /** Semver; Sites pin `templateId@major` (doc 07). */
  version: string;
  compat: TemplateCompat;

  // Metadata (dashboard gallery)
  name: string;
  description: string;
  /** Static preview asset path/URL (optional until the gallery ships). */
  preview?: string;

  // Configuration
  configSchema: z.ZodType<Config>;
  defaultConfig: Config;
  themes: readonly ThemePreset[];
  /** Tokens the user may override; must exist in every theme preset. */
  customizableTokens?: readonly TokenName[];

  // Capabilities — declarative feature support (doc 05)
  capabilities: PortfolioCapabilities;

  // Renderers — one per supported page kind; keys must match
  // `capabilities.pages` exactly (enforced by `defineTemplate`).
  pages: Partial<Record<PortfolioPageKind, PortfolioPageRenderer<Config>>>;
}

/** The discriminated union of all template kinds, keyed on `kind`. */
export type TemplateDefinition<Config = unknown> =
  | ResumeTemplateDefinition<Config>
  | PortfolioTemplateDefinition<Config>;
