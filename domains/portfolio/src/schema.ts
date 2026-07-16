import { z } from "zod";

/**
 * The portfolio domain's pure schema (docs/architecture/03-portfolio-rendering.md,
 * 04-deployment.md). A **Site** is a Document in the profile-engine sense:
 * `Profile × (template + config)`, never a copy of content. Presentation
 * config is template-owned (validated against the template's own Zod schema),
 * so it is opaque `unknown` here — the domain stays template-agnostic.
 *
 * This root is framework- and database-free (the `./server` surface, which
 * owns the `sites` table, lands with the publish flow). Kept pure so the slug
 * rules and route table are testable and shared without a DB.
 */

/**
 * Reserved slugs — never claimable as a public username (doc 04 open question,
 * resolved here). Covers our own route namespace, common infra subdomains, and
 * support/legal words a squatter shouldn't hold. Lowercase; matched
 * case-insensitively via the normalized slug.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // platform + app surfaces
  "www",
  "app",
  "api",
  "admin",
  "dashboard",
  "auth",
  "login",
  "logout",
  "signup",
  "signin",
  "settings",
  "account",
  "billing",
  "p",
  "render",
  "preview",
  "sites",
  "site",
  "resfolio",
  // infra / common subdomains
  "mail",
  "email",
  "smtp",
  "ftp",
  "cdn",
  "assets",
  "static",
  "media",
  "img",
  "images",
  "files",
  "download",
  "status",
  "health",
  // content / legal
  "about",
  "blog",
  "docs",
  "help",
  "support",
  "contact",
  "pricing",
  "terms",
  "privacy",
  "legal",
  "security",
  "careers",
  "jobs",
  "team",
  // safety
  "root",
  "superuser",
  "system",
  "null",
  "undefined",
  "test",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}

/**
 * A public site slug: 3–32 chars, lowercase alphanumeric and single internal
 * hyphens, no leading/trailing hyphen, not reserved. This is the `<username>`
 * in `resfolio.me/p/<username>` and the future `<username>.resfolio.site`
 * subdomain, so it must be DNS-label-safe.
 */
export const siteSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "must be at least 3 characters")
  .max(32, "must be at most 32 characters")
  .regex(
    /^[a-z0-9](?:[a-z0-9]|-(?![-]))*[a-z0-9]$/,
    "use lowercase letters, numbers, and single hyphens",
  )
  .refine((slug) => !isReservedSlug(slug), "that name is reserved");

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

/** Input to claim a new Site (the slug + template pick). `view` defaults to
 * the identity view (`{}` = the whole profile) — per-site tailoring is a data
 * change later, not a migration. */
export interface NewSiteInput {
  slug: string;
  templateId: string;
  templateMajor: number;
  config: SiteConfig;
  view?: unknown;
  discoverable?: boolean;
}

/**
 * Partial patch for `updateSite`; every field optional, all validated. `slug`
 * runs the full DNS-label-safe + reserved-word check; `config` stays opaque
 * (the template's schema validates it in the action before it reaches here).
 */
export const updateSiteSchema = z.object({
  slug: siteSlugSchema.optional(),
  config: siteConfigSchema.optional(),
  templateId: z.string().min(1).optional(),
  templateMajor: z.number().int().positive().optional(),
  discoverable: z.boolean().optional(),
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
  createdAt: Date;
  updatedAt: Date;
}
