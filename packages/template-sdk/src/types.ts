import type { ReactElement } from "react";
import type { z } from "zod";

import type { ProfileView, SectionKey } from "@resfolio/profile";

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
export type { ProfileView, SectionKey } from "@resfolio/profile";

export type PageSize = "A4" | "LETTER";

/**
 * Profile content a template can declare it needs. `basics.*` must be non-empty;
 * `sections.*` must have at least one item (`buildProfileView` drops empty
 * sections, so presence in the projection is the check).
 */
export type ProfileRequirementKey =
  | "basics.name"
  | "basics.summary"
  | "basics.location"
  | "basics.avatarUrl"
  | "basics.links"
  | `sections.${SectionKey}`;

/**
 * What a template cannot look right without (`checkTemplateRequirements`).
 * Advisory: the platform prompts and gates Publish; nothing blocks a render,
 * because the half-filled draft preview is what the user fixes it against.
 */
export interface TemplateRequirements {
  /** Config keys that must be non-empty. Validated against `defaultConfig`'s
   * keys by `defineTemplate`, so a typo fails at load rather than never firing. */
  config?: readonly string[];
  /** Profile content the user must supply at `/profile`. */
  profile?: readonly ProfileRequirementKey[];
}

export interface MissingRequirement {
  /** `config` is fixed in the settings form; `profile` at `/profile`. */
  scope: "config" | "profile";
  key: string;
}

/**
 * Presentation hints for a config field, merged over what the dashboard can
 * already infer from the Zod schema.
 *
 * Introspection stays the default and this stays optional **on purpose**: config
 * is the template's own vocabulary, and the dashboard must stay generic over any
 * registered template. But some things a schema genuinely cannot say — a
 * `z.string().url()` cover image is indistinguishable from any other URL, and
 * "1600×900" is not a validation rule, it's advice. Declare only what
 * introspection cannot know.
 */
export interface ConfigFieldMeta {
  /** Overrides the humanized key. */
  label?: string;
  /** Help text under the control. */
  description?: string;
  /**
   * Forces a control the schema can't imply.
   *
   * `url` matters more than it looks: the idiomatic "a URL or nothing" config
   * field is `z.union([z.literal(""), z.url()])`, and a union is a shape
   * introspection rightly refuses to guess at — so a URL field without this
   * hint is skipped and **never renders a control at all**. The template can
   * see the setting in its own schema while the user has no way to set it.
   */
  kind?: "image" | "textarea" | "url";
  /** For `kind: "image"` — the dimensions the template is designed around,
   * shown as guidance. Not enforced: we can't measure a pasted URL. */
  image?: { width: number; height: number };
}

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

  /**
   * The section order this template reads best in, seeded into a new document's
   * `ViewDefinition.sectionOrder` — after which it is **the user's data**, freely
   * reorderable and never re-imposed. Partial lists are fine: unlisted sections
   * follow in canonical order (`orderedSectionKeys`).
   *
   * Why a declaration and not a render-time default: the renderer receives an
   * already-ordered `ProfileView`, and the same `buildProfileView` runs for the
   * dashboard preview and the PDF. A template that reordered at render would
   * either duplicate that logic on both sides or break the parity guarantee.
   * Seeding keeps one source of truth — the stored view — which is also what
   * lets the Sections panel show the true order and let the user drag it.
   *
   * A future template whose sections are columns needs more than a flat list;
   * that is a new declaration next to this one, not a reinterpretation of it.
   */
  defaultSectionOrder?: readonly SectionKey[];

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
  /**
   * Presentation hints per config key, merged over Zod introspection. Optional
   * by design — declare only what a schema cannot say (that a URL is a cover
   * image, that it wants 1600×900). See `ConfigFieldMeta`.
   */
  configFields?: Readonly<Record<string, ConfigFieldMeta>>;
  /**
   * What this template cannot look right without — config keys and/or profile
   * content. Advisory: the dashboard prompts and gates Publish, nothing blocks
   * a render. See `checkTemplateRequirements`.
   *
   * Note this is separate from `configSchema` on purpose. `defineTemplate`
   * requires `defaultConfig` to parse clean, so every config field must carry a
   * default and a genuinely required field is *unrepresentable* in the schema.
   * Splitting "is it valid?" (schema) from "is it finished?" (this) keeps both
   * questions answerable.
   */
  requirements?: TemplateRequirements;

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
