# 07 — Storage Architecture

Status: Accepted

## Problem Statement

Resfolio stores four very different things: relational product data (users,
sites, subscriptions), a schema-evolving profile document, hot read-path
lookups (host → site on every public request), and large generated/uploaded
binaries (PDFs, avatars, images). One store fits none of them. We need clear
responsibilities for **PostgreSQL, Upstash Redis, and Cloudflare R2**, a
caching policy, and a scheme for generated assets that never serves stale
exports.

## Proposed Architecture

### PostgreSQL — the system of record (via Drizzle)

Everything durable and everything relational. Rule of thumb: **relational
columns for anything we look up, join, or enforce; JSONB for
schema-in-code documents** (profile content, document/site config — each
guarded by a Zod schema and `schemaVersion`, per
[01-profile-engine](01-profile-engine.md)).

Core tables (sketch):

```
users / sessions / accounts        Better Auth-managed
profiles      id, userId, draft JSONB, publishedVersionId, updatedAt
profile_versions  id, profileId, version (int), data JSONB, createdAt   -- immutable
documents     id, profileId, kind ('resume'…), name, templateId,
              templateMajor, config JSONB, view JSONB, updatedAt
sites         id, profileId, slug (unique), templateId, templateMajor,
              config JSONB, view JSONB, publishedVersionId,
              hasUnpublishedChanges, customDomain (unique, null),
              discoverable, updatedAt
assets        id, ownerId (profile), kind (AssetKind), key (unique),
              contentHash, contentType, bytes, referencedAt, createdAt
subscriptions Stripe mirror (customer, plan, status)
```

Notes:

- `documents` is `Profile × config`: `config` JSONB is the template
  presentation config (opaque to the DB, re-validated by the template's own
  Zod schema at render), `view` JSONB is the ViewDefinition (section
  selection/order/deltas, `{}` = identity). Content is never copied here — the
  Profile stays the source of truth.
- `sites.slug` and `sites.customDomain` are unique indexes — the public
  routing hot path resolves against these.
- `profile_versions` is append-only; publishes point `publishedVersionId` at
  a row. Retention: keep the last N per profile on free tier (prune job).
- `sites` mirrors `documents` (`Profile × config`): `config` is the opaque
  template config, `view` the ViewDefinition (`{}` = identity until per-site
  tailoring ships). `publishedVersionId` **pins** which published profile
  snapshot the public pages render; `hasUnpublishedChanges` (migration `0004`)
  flags presentation edits (template/config/discoverable) made since the last
  publish, so the dashboard can show "Publish changes" while a profile republish
  is tracked separately by the pin. A cached public page can therefore never
  show draft state (doc 04).
- Referential integrity, ownership checks, and billing state are Postgres's
  job — never Redis's, never JSON-blob-implied.
- Hosting: any managed Postgres (Neon/Supabase/RDS); Drizzle keeps us
  portable. Migrations via drizzle-kit, committed to the repo.

### Upstash Redis — cache and coordination, never truth

Redis holds only data that can vanish without data loss:

- **Host/slug → site resolution cache** for `apps/sites` middleware and the
  custom-domain lookup ([04-deployment](04-deployment.md)) — the highest-QPS
  query in the system. TTL ~5m + explicit delete on site changes.
- **Rate limiting** (`@upstash/ratelimit`) for auth attempts, exports,
  publishes, waitlist.
- **Short-lived coordination**: export-job dedupe locks, signed print-route
  token nonces ([02-resume-rendering](02-resume-rendering.md)).

Redis is deliberately **not** used for rendered-page caching (Next ISR + CDN
already own that layer, keyed and invalidated by tag) and not for sessions
(Better Auth's Postgres sessions with its cookie cache are sufficient;
revisit only if session reads show up in p99s).

### Cloudflare R2 — every binary

- **Generated exports (PDFs)** under **content-addressed keys**:
  `exports/{profileId}/{hash}.pdf` where
  `hash = sha256(profileVersionId, documentConfigHash, templateId@version, pageSize)`.
  Objects are **immutable** — a new publish/config produces a new key, so
  stale delivery is impossible by construction and old objects are
  garbage-collected lazily. Cache-hit exports skip Chromium entirely.
- **User uploads** (avatar, banners, project images): **proxied through the
  app** and stored at `u/{profileId}/{kind-segment}/{sha256}.webp`, recorded
  in `assets`. Implemented 2026-07-18 in `@resfolio/storage`; this bullet
  previously specified presigned URLs, `uploads/{userId}/{ulid}` keys, and
  "never proxied through the app". All three were revised, and the reasoning
  is worth keeping:
  - **Proxied, not presigned.** A presigned PUT means the server never sees
    the bytes — and every property that makes an upload safe needs the bytes.
    We decode and re-encode each image (`sharp`), which strips EXIF including
    GPS coordinates, discards appended payloads and polyglot files, verifies
    the file really is the type it claims, and compresses it. A content-type
    header is a claim, not evidence. The cost is our bandwidth on a capped,
    image-sized payload — worth paying to never serve back an unexamined file.
  - **Owner-first keys, not type-first.** `u/{profileId}/…` makes "delete
    everything this profile owns" a single prefix delete with no index to
    consult and nothing to miss. Grouping by type first (`avatars/`,
    `banners/`) reads better in a bucket browser and makes that same deletion
    a scan of every prefix, forever. The obligation we must not fail wins.
  - **Content hash, not ULID.** A ULID is unique but says nothing about
    content, forfeiting both dedupe and the `immutable` cache header while
    buying only creation-ordering the `assets` row already carries.

- **Asset lifecycle** is part of the architecture, not a cleanup script.
  `assets.referenced_at` marks a key as live when it is written into profile or
  site content, so an upload never committed to anything is collectable;
  profile deletion is a prefix delete. Two guards on deletion, both learned
  from live data (2026-07-18):
  - **An asset may only be deleted once no live content references it, and
    "live" includes every published version.** Replacing a singleton slot
    (avatar, banner) therefore only _supersedes_ the previous object — clears
    `referenced_at`, deletes nothing. Deleting eagerly broke the **published**
    site: `profile_versions` are immutable snapshots that keep rendering the
    URL they were published with, so a new avatar 404'd the old one on the live
    page while the draft looked perfect, silently. `collectOrphanedAssets`
    consequently takes a **required** set of live keys rather than an optional
    one — the dangerous call must not be the short one.
  - A **24-hour grace period**, because there is a real window between an
    upload finishing and the autosave that references it, and a sweep with no
    grace deletes assets out from under a user mid-edit.
- **Content stores absolute URLs; `assets` stores the key.** `basics.avatarUrl`
  flows through the pure `buildProfileView`, and `config.bannerImage` is read
  by templates — neither may know what R2 is, so threading a delivery origin
  through them was rejected. The origin therefore appears in stored content,
  which makes the eventual `r2.dev` → custom-domain move a one-time
  `regexp_replace`. The one place that would have made dangerous is
  reference-marking: `assetKeyFromUrl` matches the **key portion only**,
  ignoring the origin, so already-stored URLs keep resolving after the swap.
  Anchor that parse to the configured origin and the day it changes, every
  live asset looks orphaned and the sweep deletes users' images.
- **Derived images** (OG cards, template thumbnails): same content-hash
  pattern as exports.
- Serving: public bucket domain behind Cloudflare CDN for site images;
  short-lived signed URLs for private exports. Zero egress fees is why R2
  over S3.

### What is cached where (one table)

| Data                           | Store          | Invalidation                            |
| ------------------------------ | -------------- | --------------------------------------- |
| Rendered portfolio pages       | Next ISR + CDN | `revalidateTag('site:<id>')` on publish |
| Host/slug → site               | Redis          | TTL + delete on change                  |
| Generated PDFs / OG images     | R2 (immutable) | never — new content = new key           |
| Profile draft/versions, config | Postgres       | n/a (source of truth)                   |
| Rate-limit counters, locks     | Redis          | TTL                                     |

## Tradeoffs

- **JSONB for profile content** trades in-database item querying for
  evolution speed and atomic reads — argued and accepted in
  [01-profile-engine §Tradeoffs](01-profile-engine.md). Generated columns /
  a search index are the escape hatch if querying becomes real.
- **Append-only versions cost storage** (a profile blob per publish).
  Blobs are small (tens of KB); pruning policy caps it. The payoff —
  trivially correct caching and history — is disproportionate.
- **Content-addressed exports never "update"** — users always get exactly
  what a version produced. The cost is orphaned objects, handled by a lazy
  GC job rather than eager deletes.
- **Redis as pure cache** means every Redis miss must be servable from
  Postgres — slightly more careful code, total immunity to cache loss.
- **Presigned direct uploads** complicate the client slightly versus
  proxying, but keep large bodies off our functions and are the only shape
  that scales.

## Future Scalability

- **Blogs/CMS**: ~~posts become rows~~ — **shipped 2026-07-18 exactly as
  predicted**: `blog_posts` is relational metadata (title, slug, status,
  `published_at`, `reading_minutes`, `cover_asset_key`) plus a structured
  content JSONB body, no new stores. Two things worth recording, because
  neither was obvious from the prediction:
  - **The body is a second content shape, not the profile's rich text.** The
    profile's Markdown subset is small so a resume survives plain-text ATS
    extraction; a post needs headings, code blocks, task lists and callouts,
    which it cannot express. Widening it would have widened it for resumes too.
    The post body is TipTap/ProseMirror JSON over a node whitelist, which also
    makes raw HTML **unrepresentable** rather than filtered.
  - **Posts are rows precisely because the Profile is one document.** The
    profile blob is rewritten in full on every autosave and snapshotted in full
    on every publish (above), so prose inside it would make both costs scale
    with how much the user has written. Posts stay profile-_owned_ and are
    projected into the Writing section at view-build time, which keeps "the
    Profile is the source of truth" true at the layer that matters — the
    ProfileView every renderer consumes.
- **Analytics**: PostHog first; if first-party page analytics ship, that's a
  columnar/aggregate concern (e.g. ClickHouse or aggregated Postgres tables),
  explicitly _not_ forced into the OLTP schema.
- **Search** ("browse public portfolios"): Postgres FTS first, dedicated
  index later — reads from versions, no schema change.
- **Read replicas / partitioning**: `profile_versions` is the growth table
  and is append-only — the easiest shape to partition or archive to R2.
- **Teams/orgs**: ownership becomes a join table; JSONB content untouched.

## Implementation Strategy

1. `packages/database` (`@resfolio/database`): Drizzle client, schema,
   migrations; consumed only by domains and Better Auth setup.
2. `packages/env` with `@t3-oss/env-nextjs`: validated `DATABASE_URL`,
   `UPSTASH_*`, `R2_*` from the start.
3. Tables land with their features (profiles with the editor, sites with
   `apps/sites`, assets with uploads) — no speculative schema.
4. Redis enters with the first rate limit (auth), R2 with the first export.
5. GC job (Trigger.dev scheduled) for orphaned exports + version pruning,
   once exports exist.

## Open Questions

- Postgres host (Neon vs. Supabase vs. RDS) — operational choice, decide at
  auth implementation; schema is portable either way. **Now blocking**: the
  serverless connection strategy depends on which pooler the host offers, and
  the pool as currently configured cannot survive production concurrency —
  see [15](15-production-readiness.md) §2.1, which supersedes the "revisit when
  the host is picked" note in `packages/database/CLAUDE.md`.
- Version retention numbers per plan tier (free: last 5? paid: unlimited?) —
  product/pricing decision.
- Whether draft autosave history (undo across sessions) needs its own
  lightweight snapshot mechanism or piggybacks on versions — decide during
  editor build.

## Alternatives Considered

- **Everything relational** (normalized profile item tables) — rejected in
  [01-profile-engine](01-profile-engine.md); repeated here because storage is
  where the pressure to normalize will recur. Resist until there's a query
  that needs it.
- **MongoDB/document DB for profiles** — fits the document shape but forfeits
  the relational half (billing, domains, integrity) or forces two databases
  on day one. Postgres + JSONB is both halves in one system.
- **Vercel KV / Blob** — equivalent products with worse pricing (blob egress)
  and deeper platform lock-in than Upstash/R2, which are already
  provider-neutral. Rejected.
- **Redis as session store / render cache** — adds a truth-adjacent
  dependency where Postgres and ISR already suffice; every byte in Redis
  must stay expendable. Rejected.
- **Storing PDFs in Postgres (bytea)** — bloats backups and the buffer pool,
  no CDN path. Rejected without much ceremony.

## Final Recommendation

Postgres (Drizzle) is the only system of record — relational where we join
or enforce, JSONB-with-Zod where the schema lives in code, append-only
`profile_versions` powering publish and cache correctness. Upstash Redis is
strictly expendable: hot route resolution, rate limits, locks. R2 holds every
binary, with generated assets content-addressed and immutable so stale
exports are structurally impossible. Three stores, one owner of truth, and
every cache invalidation reduced to either a tag purge or "new content, new
key."
