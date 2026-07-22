# @resfolio/profile — the profile engine

The product's core domain (docs/architecture/01-profile-engine.md). This is
the first `domains/*` package and sets the pattern every future domain
(`resume`, `portfolio`, `integrations`) copies.

## Layering — this is load-bearing

- **Root export (`.`) is pure and framework-free.** Schema, `migrateProfile`,
  `buildProfileView`, edit helpers, ids, seed. No `next/*`, no database, no
  I/O, no clock, no randomness beyond `createItemId`. Safe to import from
  server code, the client editor island, and tests alike. Keep it that way —
  the optimistic client-side preview (doc 08) depends on `buildProfileView`
  running identically in the browser and on the server.
- **`./server` is the only database-aware surface.** Draft/publish
  persistence over `@resfolio/database`. Every function takes the auth
  context (`userId`) explicitly and scopes every query to it — ownership is
  enforced here, never assumed from the caller (doc 06/10). Apps call these
  from Server Actions/Components; they never touch the DB directly.
  `ProfileDraft.hasUnpublishedChanges` is the authoritative "draft differs from
  the published snapshot" flag (canonical `migrateProfile` diff; always true
  when never published) — the editor disables Publish when there's nothing new
  to snapshot.
- **The public username (`handle`) is a profile concern, not a per-output one.**
  A handle is one identity that names both the portfolio (`/p/<handle>`) and the
  public resume (`/r/<handle>`), so its rules live in the **pure root**
  (`handle.ts`: `handleSchema`, `RESERVED_HANDLES`, `isReservedHandle` — the
  DNS-label-safe format + reserved blocklist, incl. both single-letter route
  namespaces `p` and `r`). `@resfolio/portfolio` re-exports these as
  `siteSlugSchema` / `RESERVED_SLUGS` (it depends on profile, never the reverse —
  which is *why* the rules moved here). `./server` owns the writes:
  `claimHandle` (both the portfolio and resumes sections drive it — whichever
  the user reaches first is the entry point), `isHandleAvailable`,
  `getProfileByHandle` (the render host's public resolve), and `setPublicResume`
  (pins which resume `/r/<handle>` shows; null → the host auto-uses the sole
  resume). Columns landed in migration `0012`, promoted off `sites.slug`.

## Rules the schema enforces (don't weaken casually)

- The **Zod schema is the source of truth** (`schema/`); types are inferred,
  storage validates what it writes. Bump `PROFILE_SCHEMA_VERSION` **and** add
  a `v(n)→v(n+1)` step in `migrate.ts` together — never edit v1 semantics in
  place once real data exists. `migrate.test.ts` is the guard.
- Every item has a stable **`id`** (`createItemId`, never reused) and
  **`source`** provenance. Deltas and edit helpers never patch those.
- User text is **hostile input** (doc 10): URLs are restricted to
  http/https/mailto at the schema layer, rich text is a Markdown subset with
  **no raw HTML**. Renderers re-check on output — but nothing unsafe reaches
  storage.

## Testing

Unit tests are co-located and exhaustive — this package must stay the
best-tested code in the repo (doc 11). The shared realistic corpus lives in
`@resfolio/fixtures` (which depends on this package — never the reverse, or
the workspace graph cycles). This package's own tests use focused inline data
plus the version-specific migration blobs in `migrate.test.ts`.
