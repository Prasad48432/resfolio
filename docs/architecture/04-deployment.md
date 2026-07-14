# 04 — Portfolio Deployment

Status: Accepted

## Problem Statement

Published portfolios must be reachable at `resfolio.me/p/<username>` (and
later at custom domains), load fast globally, cost near-zero per additional
user, and update the moment a user publishes. The core fork in the road:
**one deployment per user** versus **one multi-tenant application rendering
every portfolio**. We also need the rendering strategy (request-time, ISR,
static, edge…) and the custom-domain story.

## Proposed Architecture

### One multi-tenant renderer: `apps/sites`

A single Next.js application renders every portfolio. No per-user
deployments, ever, for the core product. At hundreds of thousands of users,
per-user deployments mean hundreds of thousands of builds on every SDK/
security fix — an operational non-starter. Multi-tenant rendering makes a new
user a **database row**, and a template fix one deploy that upgrades everyone.

Hosting: **Vercel** for V1 (zero-ops Next.js, ISR, image optimization,
wildcard + custom domain support out of the box). The app itself is
platform-portable (standard Next), so this is a default, not a lock-in.

### Routing

`apps/sites` owns all routing with one catch-all:

```
app/p/[username]/[[...slug]]/page.tsx
```

1. Resolve `username` → Site record (which published profile version, which
   template@version, config) — one cached lookup.
2. Match `slug` against the **platform route table** (`/`, `/projects`,
   `/projects/[slug]`, `/blog`, `/blog/[slug]`, `/about`, `/resume`) — routes
   are a platform concept so URLs stay stable across template switches; the
   template declares via capabilities which of them it supports
   ([05-template-sdk](05-template-sdk.md)) and unsupported ones 404 or
   redirect home.
3. Dispatch to the template's page renderer with the resolved ProfileView.

Full routing details (nested routes, SEO, template-exposed pages) are in this
document because routing and deployment share the same resolution step;
[03-portfolio-rendering](03-portfolio-rendering.md) covers what templates do
_inside_ a page.

**SEO** is platform-owned: `generateMetadata` builds title/description/OG
from the ProfileView, plus canonical URLs, JSON-LD (`Person`, `Article` for
posts), per-site `sitemap.xml` and `robots.txt` (respecting a per-site
"discoverable" toggle). Templates can refine, never replace, metadata.

### Rendering strategy: dynamic render + full-page cache (ISR + tags)

Portfolios are read-heavy, write-rare, and public — the ideal cache shape:

- Pages render as **Server Components at request time, cached indefinitely**
  with Next.js ISR, tagged `site:<siteId>`.
- **Publish** calls `revalidateTag('site:<id>')`: the next request re-renders
  from the new published profile version; everything else stays cached.
- CDN serves cache hits at the edge; origin renders only misses. Steady-state
  cost ≈ CDN bandwidth.
- Because pages always render a _published version_
  ([01-profile-engine](01-profile-engine.md)), a cached page can never show
  draft state — correctness doesn't depend on cache timing.
- No `revalidate` timer needed (nothing changes without a publish); a long
  fallback TTL (e.g. 24h) guards against missed invalidations.

Not static-per-user (build-time explosion), not pure request-time (wasteful),
not edge-runtime rendering (Node runtime keeps full compatibility; the CDN
already gives us edge _serving_, which is what matters).

### Custom domains

Phased:

1. **V1**: path routing only — `resfolio.me/p/<username>`. Zero domain ops.
2. **V1.x — subdomains**: `<username>.resfolio.site` via one wildcard domain
   - middleware rewriting host → `/p/<username>/…`. (A separate site domain
     avoids cookie/security bleed from the `resfolio.me` app domains.)
3. **Custom domains** (paid tier): user adds `CNAME` → we attach the domain
   to the sites app (Vercel Domains API for V1; **Cloudflare for SaaS** is
   the swap-in at scale/cost) → automatic TLS. Middleware maps
   `Host` → site via a Redis-cached lookup. Canonical URL becomes the custom
   domain; the `/p/` URL 301s to it.

The `Host`/path → Site resolution is one small function, so each phase is
additive.

## Tradeoffs

- **Multi-tenant = shared blast radius.** A bad deploy affects all sites at
  once (mitigated by preview deploys, visual regression in CI, instant
  rollback) — accepted in exchange for one system to operate, monitor, and
  patch.
- **Shared bundle/runtime**: users can't get bespoke server code. Correct
  product boundary — customization flows through templates + config.
- **Vercel costs** rise with scale (image optimization, function invocations)
  — accepted for V1 velocity; the tag-based cache keeps invocations
  proportional to publishes, and portability is preserved.
- **Platform-owned route table** constrains templates to known page types —
  the tradeoff that keeps URLs stable when users switch templates, which is
  a product promise worth more than exotic per-template URL schemes.

## Future Scalability

- **Custom pages/CMS**: user-defined slugs become rows the route table
  consults after built-ins — same resolution step.
- **Per-site analytics**: a lightweight beacon in the sites app to PostHog;
  cached pages don't prevent client-side beacons.
- **Very high scale**: swap Vercel for self-hosted Next behind Cloudflare
  (cache tags → CDN purge API), move domain TLS to Cloudflare for SaaS.
  Architecture unchanged.
- **White-label**: strip platform chrome per plan flag at render time.
- **Static export tier** (e.g. "download your site") can be added as another
  pipeline output without touching serving.

## Implementation Strategy

1. Scaffold `apps/sites` (Next 16, port 3002) with the catch-all route,
   Site resolution, and the template registry.
2. ISR + `revalidateTag` wiring, publish action calls invalidation.
3. SEO layer: metadata, JSON-LD, sitemap/robots per site.
4. Subdomain middleware (phase 2) behind a flag.
5. Custom domains + Redis host-mapping (phase 3, with billing).

## Open Questions

- Reserved-username policy (`www`, `admin`, `api`, offensive terms) — needed
  before public slugs ship; maintain a blocklist in `domains/portfolio`.
- Whether `resfolio.site` (or similar) is acquired for subdomains, and
  when subdomains become the canonical free-tier URL vs. `/p/` paths.
- Bot/abuse posture for public sites (rate limiting at CDN vs. middleware) —
  decide when traffic justifies it.

## Alternatives Considered

- **Per-user deployments** (Vercel project per user, or build-and-upload
  static sites): true isolation and per-user rollback, but builds × users
  explodes cost/time, fleet-wide fixes become mass redeploys, and dynamic
  features fragment. Rejected outright for core; a niche "eject to your own
  hosting" enterprise feature could revisit it.
- **Fully static generation at publish time** (`generateStaticParams` /
  export): equivalent steady-state performance to tagged ISR, but publish
  latency and build coupling worsen with user count, and request-time
  features (A/B, geo, white-label flags) get harder. ISR-with-tags is the
  same economics without the build coupling.
- **Edge-runtime SSR everywhere**: lower TTFB on cache misses only; costs
  Node-API compatibility across every template dependency. CDN-cached pages
  make misses rare, so the constraint buys almost nothing.
- **Separate origin per template** (template = micro-frontend): operational
  complexity of per-user deployments through the back door. Rejected.

## Final Recommendation

One multi-tenant `apps/sites` Next.js application on Vercel renders every
portfolio through a single catch-all route: resolve Site → dispatch to
registered template → serve via ISR pages tagged per site and invalidated on
publish. URLs are platform-owned and stable across template switches. Domains
arrive in three additive phases (path → wildcard subdomain → custom domains
via CNAME + hosted TLS). This is the architecture where user #400,000 costs a
row and a few cached pages — not a build.
