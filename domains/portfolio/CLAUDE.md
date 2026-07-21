# @resfolio/portfolio — the portfolio domain

The business logic behind public portfolio sites (docs/architecture/03-portfolio-rendering.md,
04-deployment.md). A **Site** is a Document in the profile-engine sense —
`Profile × (template + config)`, never a copy of content. Mirrors the layering
of `@resfolio/profile` and `@resfolio/document`.

## Layering

- **Root (`.`, pure):** framework- and database-free. `siteSlugSchema` +
  `RESERVED_SLUGS` / `isReservedSlug` (the doc-04 blocklist — never claimable
  as a public username), `resolvePortfolioRoute` (the **platform route table**,
  doc 04: URL segments → `{ page, params }`, total and returns `null` for
  unknown paths so the host 404s), `SiteRecord` type. Safe to import into the
  sites host, the dashboard, and tests.
- **`./server` (DB).** The only code that touches the `sites` table. Owner-scoped
  CRUD (`getSiteForOwner`, `createSite`, `updateSite`, `isSlugAvailable`) — every
  function takes `userId` and scopes to the profile that user owns. Two unscoped
  public reads for the render host: `getSiteForRender(slug)` (returns the render
  descriptor + the **pinned** published Profile, loaded via
  `@resfolio/profile/server`'s `getProfileVersionById` — never the draft) and
  `getSiteIdBySlug` (the cheap `slug → site:<id>` lookup the host runs to derive
  the cache tag). **`getSiteIdBySlug` answers for any _claimed_ slug, published
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
- **Slugs are DNS-label-safe** (3–32 chars, lowercase, single internal
  hyphens) because the same slug becomes a `*.resfolio.site` subdomain later
  (doc 04). Keep the reserved list ahead of new app/route namespaces.

## Tests

Co-located vitest: slug accept/reject (length, hyphen edges, charset, reserved,
normalization) and route-table resolution (index routes, detail slugs, 404 for
unknown/over-deep paths).
