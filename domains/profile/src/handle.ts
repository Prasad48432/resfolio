import { z } from "zod";

/**
 * The public **handle** — a profile's username (docs/architecture/04-deployment.md).
 *
 * A handle is an **identity** concept: it belongs to the Profile, not to any one
 * output. The same handle names the portfolio (`resfolio.me/p/<handle>`), the
 * public resume (`resfolio.me/r/<handle>`), and the future
 * `<handle>.resfolio.site` subdomain — so it must be globally unique and
 * DNS-label-safe. Claimable from either the portfolio or the resumes section;
 * whichever claims first sets it, and both outputs share it.
 *
 * These rules used to live in `@resfolio/portfolio` as `siteSlugSchema` /
 * `RESERVED_SLUGS`. They moved here (and portfolio re-exports them) once the
 * handle became a profile-level concern validated by `@resfolio/profile/server`
 * — profile can't depend on portfolio (portfolio already depends on profile), so
 * the pure rules live at the root of the depended-upon package.
 */

/**
 * Reserved handles — never claimable as a public username. Covers our own route
 * namespace, common infra subdomains, and support/legal words a squatter
 * shouldn't hold. Lowercase; matched case-insensitively via the normalized
 * handle.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
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
  // `/r/<handle>` is the public resume route — keep the single-letter route
  // namespaces out of the claimable set alongside `p`.
  "r",
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

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle.trim().toLowerCase());
}

/**
 * A public handle: 3–32 chars, lowercase alphanumeric and single internal
 * hyphens, no leading/trailing hyphen, not reserved. This becomes the
 * `<handle>` in `resfolio.me/p/<handle>` and `resfolio.me/r/<handle>` (and the
 * future `<handle>.resfolio.site` subdomain), so it must be DNS-label-safe.
 */
export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "must be at least 3 characters")
  .max(32, "must be at most 32 characters")
  .regex(
    /^[a-z0-9](?:[a-z0-9]|-(?![-]))*[a-z0-9]$/,
    "use lowercase letters, numbers, and single hyphens",
  )
  .refine((handle) => !isReservedHandle(handle), "that name is reserved");
