# @resfolio/portfolio — the portfolio domain

The business logic behind public portfolio sites (docs/architecture/03-portfolio-rendering.md,
04-deployment.md). A **Site** is a Document in the profile-engine sense —
`Profile × (template + config)`, never a copy of content. Mirrors the layering
of `@resfolio/profile` and `@resfolio/document`.

## Layering

- **Root (`.`, pure):** framework- and database-free. `resolvePortfolioRoute`
  (the **platform route table**, doc 04: URL segments → `{ page, params }`, total
  and returns `null` for unknown paths so the host 404s), `SiteRecord` type, plus
  `siteSlugSchema` / `RESERVED_SLUGS` / `isReservedSlug` **re-exported from
  `@resfolio/profile`** (`handleSchema` et al). The public username is a
  **profile handle** now (shared by the portfolio and resume outputs), so the
  pure slug rules live at the root of the profile engine — portfolio depends on
  profile, not the reverse, and these aliases keep old call sites working. Safe
  to import into the sites host, the dashboard, and tests.
- **`./server` (DB).** The only code that touches the `sites` table. Owner-scoped
  CRUD (`getSiteForOwner`, `createSite`, `updateSite`) — every function takes
  `userId` and scopes to the profile that user owns. **The public username is
  `profiles.handle`, not a `sites` column** (migration 0012), so `createSite`
  needs the handle claimed first (via `@resfolio/profile`'s `claimHandle`) and
  neither it nor `updateSite` accepts a slug — renames go through `claimHandle`.
  Availability is `@resfolio/profile/server`'s `isHandleAvailable`. Every
  by-username read resolves the **profile** first, then its site:
  `getSiteForRender(handle)` (returns the render descriptor + the **pinned**
  published Profile, loaded via `getProfileVersionById` — never the draft),
  `getSiteRefBySlug`/`getSiteIdBySlug` (the cheap `handle → site:<id>` lookup the
  host runs to derive the cache tag). `SiteRecord.slug` is sourced from the
  joined handle. **`getSiteIdBySlug` answers for any _claimed_ slug, published
  or not, and that is a correctness requirement, not a convenience.** It used to
  return null for an unpublished site, so the render host 404'd _before_ it had
  a tag to cache that answer under — Next cached the 404 for the full
  `revalidate` window with no tag on it, and `publishSite`'s
  `revalidateTag('site:<id>')` could not reach it. A freshly published site kept
  serving "not found" for up to 24 hours, and the gap between claiming a slug
  and publishing it is exactly when someone loads their own URL to look. Publish
  state is decided by `getSiteForRender`, _inside_ the cache.
  `listDiscoverableSites` feeds the platform sitemap.
  `publishSite(userId)` pins the profile's currently published version into the
  site (throws `ProfileNotPublishedError` if the profile was never published) and
  returns the `siteId`; **the app layer owns cache invalidation** (calls
  `apps/sites`'s `/api/revalidate`), mirroring the profile/document publish flow.
  A presentation edit (`updateSite`: template/config/discoverable) sets
  `has_unpublished_changes` (migration `0004`); `publishSite` clears it — so
  `SiteRecord.hasUnpublishedChanges` tells the dashboard the live page is stale
  even when the pinned profile version is unchanged (a profile republish is
  caught separately by comparing the pin to the profile's published version).
  **`updateSite` only sets the flag when a patch actually changes stored
  presentation** — an autosave that re-sends identical config (a remount, a
  StrictMode double-effect) leaves it untouched, so the dashboard never shows
  "Publish changes" for changes that were never made. Config is compared through
  the schema so key order isn't mistaken for a change.
- **`./token` is the signed draft-capability token** (`node:crypto`,
  server-only): `{ source: "draft", ref: userId, exp }`. **Currently unused —
  parked, not dead (2026-07-18).** Its consumer was the iframed draft-preview
  route, removed because re-rendering the whole portfolio app on every save was
  the wrong cost to keep paying while templates are still moving. Kept because
  the replacement preview will need it: any owner-only draft surface a
  _browser_ must load needs a capability in the URL, and this one is written
  and tested. Server-to-server calls (`/api/revalidate`, PDF export) use the
  plain `RENDER_SECRET` bearer — no token when no browser is involved. **If the
  new preview lands without needing it, delete it** rather than letting it sit.

## Rules

- **Routes are platform-owned, not template-owned** (doc 04). URLs stay stable
  across template switches — a template only declares _which_ platform pages it
  supports via `capabilities.pages`; unsupported pages 404. Add a new page kind
  by extending the SDK's `PORTFOLIO_PAGE_KINDS` and this route table together.
- **Config is template-owned and opaque here** (`unknown`). The domain never
  validates presentation config — that's the template's own Zod schema, run by
  the render host. Data lives in the Profile; knobs live in config (doc 03).
- **The favicon is a general site setting, not config** — `sites.favicon_key`
  (migration 0013), a nullable R2 asset **key** (doc 07: keys, not URLs, are
  stored). It rides `updateSite`/`SiteRecord`/`getSiteForRender` like any other
  presentation field (sets `has_unpublished_changes`); the render host resolves
  the key to a URL for the page favicon. Ownership of the key is validated in
  the dashboard action before it reaches here.
- **Slugs are DNS-label-safe** (3–32 chars, lowercase, single internal
  hyphens) because the same handle becomes a `*.resfolio.site` subdomain later
  (doc 04). The rules + reserved list live in `@resfolio/profile` now — keep the
  reserved list ahead of new app/route namespaces there (it already reserves
  both `p` and `r`).

## Tests

Co-located vitest: route-table resolution (index routes, detail slugs, 404 for
unknown/over-deep paths) and a smoke check that the re-exported slug schema
still accepts/rejects. The exhaustive handle accept/reject cases (length, hyphen
edges, charset, reserved incl. `p`/`r`, normalization) live with the rules in
`@resfolio/profile` (`handle.test.ts`).
