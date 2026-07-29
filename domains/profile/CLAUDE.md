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
  which is _why_ the rules moved here). `./server` owns the writes:
  `claimHandle` (both the portfolio and resumes sections drive it — whichever
  the user reaches first is the entry point), `isHandleAvailable`,
  `getProfileByHandle` (the render host's public resolve), and `setPublicResume`
  (pins which resume `/r/<handle>` shows; null → the host auto-uses the sole
  resume). Columns landed in migration `0012`, promoted off `sites.slug`.

- **`orderedSectionKeys` (in `view.ts`) is exported, and callers must use it
  rather than re-deriving the rule.** Three surfaces need the same answer to "what
  order do sections render in" — `buildProfileView` itself, the dashboard's resume
  Sections panel, and the AI tailoring review, which has to know whether a
  proposed order differs from the current one. The panel carried a copy until the
  third caller appeared.
- **`describe.ts` names things.** Which field displays an item —
  `role`+`company` for a job, `institution` for a degree — is schema knowledge,
  so `profileItemLabel` / `describeProfileItems` live here rather than being
  re-derived per surface. Two already depend on it (doc 13): the AI proposal
  review labels the item a change touches, and the job analysis resolves the
  item ids a claimed match cites. A custom section contributes its **entries**,
  never the heading — citing "Publications" as evidence says nothing.
- **`proposal.ts` is the AI layer's guard, and it lives here on purpose**
  (doc 13, Phase 3). `profileChangeSchema` / `reviewProfileChanges` /
  `applyProfileChanges` are pure-root code: they validate against this
  package's schemas and write through this package's edit helpers, so a
  `@resfolio/ai` package would have been a wrapper around profile business
  logic. Nothing in the file imports an SDK, a provider or a prompt.
  Four invariants live there and must not be softened without reading doc 13:
  **no "add" variant** (a change names an existing item by id; there is no
  shape for "add a role at Globex"); **`PROPOSABLE_ITEM_FIELDS` allowlists
  prose only** — facts (company, role, institution, dates, URLs, issuer,
  fluency) are absent, as are `certifications` and `languages` entirely;
  **sets may not gain a member** (case-insensitive, so a spelling fix is not a
  new claim) and **prose lists may not lengthen** (a fourth bullet is a fourth
  claim); **every value re-parses through the section's own schema**.
  **`profileChangeSchema` is a `z.union`, and must not be "tidied" into a
  `z.discriminatedUnion`.** They are equivalent in TypeScript and accept the same
  values, but Zod emits **`anyOf` for the former and `oneOf` for the latter**, and
  OpenAI's strict `response_format` subset permits `anyOf` and rejects `oneOf`
  outright — a 400 before generation starts, which on screen is indistinguishable
  from the model failing to answer. It went unnoticed because the _chat_ passes
  this schema as a **tool** input, which is not validated under that subset, so
  the one path that never called `generateObject` kept working while job
  enhancement and resume tailoring both failed. `proposal.test.ts` asserts the
  emitted JSON Schema for `profileProposalSchema` and `tailorPlanSchema` carries
  no `oneOf` — the only form of this rule a reader can check.
  `applyProfileChanges` **re-runs the guard** rather than trusting its caller —
  `updateItem` alone would accept a grown `skills` array, because that is valid
  _data_; it is only invalid relative to what was there.
- **`skills.ts` is the one place a set-valued field may grow, and the reason is
  _who is asking_.** `proposal.ts`' rule stays absolute for a `ProfileChange`,
  because a model proposes those. Here the user ticks a box beside their own
  sentence: `findDemonstratedSkills` offers only terms that already appear
  **elsewhere in the profile** — the Skills section is excluded from
  `demonstrationHaystack`, so a listed term can never vouch for a copy of itself
  in a second group — and `addDemonstratedSkills` **re-derives that evidence and
  throws** rather than trusting its caller. There is no argument that lists a
  term the profile does not already contain, which makes it a structural
  guarantee rather than a policy.
  The gap it exists for is real and common: a project's `technologies` say
  Docker, an experience bullet says Docker, and the Skills section — the block a
  resume prints and an ATS scans — says nothing, so "Docker ✓" sat above a resume
  that never mentioned it. It cannot invent a group, and it cannot judge
  competence: appearing in the user's own writing is the whole bar.
  **`termAppearsIn` lives here, not in the dashboard**, because a guard depends
  on it — "does the profile mention this" must have one answer, and the direction
  two answers would diverge in is a screen saying you have Docker over a guard
  refusing to list it.
- **`tailor.ts` is job tailoring, and it reuses the guard rather than relaxing
  it** (doc 13, Phase 5). A tailoring plan writes a **`ViewDefinition`** — deltas
  and a `basics` summary on one resume document — never the Profile. It fits
  `reviewProfileChanges` with no adaptation because a `ProfileChange` already _is_
  a delta coordinate (item id + field + value is what `deltas` is keyed by), which
  is why there is no second change schema. Four things not to soften:
  - **The guard base is the canonical Profile**, never the already-tailored view.
    A view-relative base lets tailoring ratchet: every pass legal against the
    last, the tenth unrecognisable against the first.
  - **The plan schema has no `exclude` and no `include`.** Tailoring may reorder
    and may never hide — the mirror of the no-add rule, because a role silently
    missing from a resume someone sends is a lie by omission. That is also why
    reordering carries no per-item consent: an ordering cannot state anything.
  - **`applyTailoredChanges` re-runs the guard**, for a reason the render path
    does not cover: `buildProfileView` re-parses every delta through the section
    schema, so an invalid value can never render — but a `highlights` array that
    grew from three to four is valid _data_, and only the guard knows it is a
    fourth claim.
  - **`applyTailoredEmphasis` merges into each section**, so the user's own
    `include`/`exclude` choices survive a pass; `clearTailoring` drops `deltas`
    and `basics` and keeps them for the same reason.
  - Nothing in the file imports an SDK, a provider or a prompt. **No field in the
    model-facing schema is `.optional()`** — strict structured output requires
    every property present, and an empty array says "nothing to propose" just as
    clearly.

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
