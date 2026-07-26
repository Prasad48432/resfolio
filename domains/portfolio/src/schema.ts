import {
  handleSchema,
  isReservedHandle,
  RESERVED_HANDLES,
} from "@resfolio/profile";
import { z } from "zod";

/**
 * The portfolio domain's pure schema (docs/architecture/03-portfolio-rendering.md,
 * 04-deployment.md). A **Site** is a Document in the profile-engine sense:
 * `Profile × (template + config)`, never a copy of content. Presentation
 * config is template-owned (validated against the template's own Zod schema),
 * so it is opaque `unknown` here — the domain stays template-agnostic.
 *
 * This root is framework- and database-free (the `./server` surface, which
 * owns the `sites` table, lands with the publish flow). Kept pure so the route
 * table is testable and shared without a DB.
 */

/**
 * Slug rules re-exported from `@resfolio/profile`. The public username is a
 * **profile handle** now (shared by the portfolio and resume outputs), so the
 * pure rules live at the root of the profile engine — portfolio already depends
 * on profile, and profile can't depend back on portfolio. These aliases keep
 * every existing `siteSlugSchema` / `RESERVED_SLUGS` call site working.
 */
export const siteSlugSchema = handleSchema;
export const RESERVED_SLUGS = RESERVED_HANDLES;
export const isReservedSlug = isReservedHandle;

/** The document kind this domain owns; `portfolio` only, mirroring the SDK. */
export const siteKindSchema = z.literal("portfolio");

/**
 * Presentation config is template-owned and opaque at this layer — each
 * template re-validates it with its own Zod schema at render (doc 05) — so we
 * model it as an arbitrary JSON object and never interpret it here. Mirrors
 * `@resfolio/document`'s `documentConfigSchema`.
 */
export const siteConfigSchema = z.record(z.string(), z.unknown());
export type SiteConfig = z.infer<typeof siteConfigSchema>;

/** Input to claim a new Site (the template pick). The public username is the
 * profile's **handle** — claimed separately via `@resfolio/profile`'s
 * `claimHandle` before a site is created — so it is not part of this input.
 * `view` defaults to the identity view (`{}` = the whole profile) — per-site
 * tailoring is a data change later, not a migration. */
export interface NewSiteInput {
  templateId: string;
  templateMajor: number;
  config: SiteConfig;
  view?: unknown;
  discoverable?: boolean;
}

/**
 * Partial patch for `updateSite`; every field optional, all validated. The
 * username is a profile handle now, changed through `claimHandle`, so it is not
 * a site patch. `config` stays opaque (the template's schema validates it in
 * the action before it reaches here).
 */
export const updateSiteSchema = z.object({
  config: siteConfigSchema.optional(),
  templateId: z.string().min(1).optional(),
  templateMajor: z.number().int().positive().optional(),
  discoverable: z.boolean().optional(),
  /** The favicon's R2 asset key, or `null` to clear it. Opaque here — the
   * dashboard validates ownership before it reaches the domain. */
  faviconKey: z.string().min(1).nullable().optional(),
});
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;

/**
 * The Site record shape (the `sites` table lands with `./server`). `config` is
 * template-owned presentation, kept opaque here. `view` is a `ViewDefinition`
 * (identity `{}` = the whole profile) applied by `buildProfileView`.
 * `publishedVersionId` pins which published profile version the public pages
 * render — a cached page can therefore never show draft state (doc 04).
 */
export interface SiteRecord {
  id: string;
  profileId: string;
  slug: string;
  templateId: string;
  templateMajor: number;
  config: unknown;
  view: unknown;
  publishedVersionId: string | null;
  /** Whether the presentation (template + config + discoverable) has changed
   * since the last publish — the public page is stale until `publishSite`. */
  hasUnpublishedChanges: boolean;
  discoverable: boolean;
  /** The favicon's R2 asset key, or null. Resolved to a URL at render/preview
   * time — keys are origin-independent (doc 07). */
  faviconKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}
