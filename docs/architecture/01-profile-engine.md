# 01 — Profile Engine

Status: Accepted

## Problem Statement

Resfolio's core promise is **One Profile → Many Outputs**. Resumes, portfolios,
public websites, PDFs, cover letters, and JSON Resume exports must all be
generated from a single professional profile. The moment any output stores its
own copy of profile data, synchronization breaks and Resfolio becomes just
another resume builder.

The Profile Engine must answer:

1. What is the canonical shape of a Profile?
2. How does that shape evolve over years without breaking existing users,
   templates, or exports?
3. How can a resume be _tailored_ (reordered, trimmed, reworded for one job)
   without duplicating profile data?
4. How do connected sources (GitHub, LinkedIn, Medium) feed the profile
   without fighting manual edits?

## Proposed Architecture

### The three-layer model

Every output is produced by composing exactly three things:

```
Profile (canonical data)  ×  Document (selection + deltas)  ×  Template (presentation)
        one per user            one per output instance         shared, versioned
```

- **Profile** — the single source of truth. All facts about the person.
- **Document** — a _view definition_ over the Profile: which sections and
  items are included, in what order, plus explicit per-item overrides
  ("deltas") for tailoring. A resume, a cover letter, and a portfolio site
  config are all Documents. Documents never copy profile data; they reference
  profile items by stable id.
- **Template** — presentation only (see [05-template-sdk](05-template-sdk.md)).
  Templates receive a read-only projection of Profile + Document and return
  markup. They hold zero business logic.

### Canonical schema

The Profile schema is defined **once, in Zod**, in `domains/profile`. The Zod
schema is the source of truth; TypeScript types are inferred from it and the
database stores what it validates.

```ts
// domains/profile — sketch, not final field list
export const profileSchema = z.object({
  schemaVersion: z.literal(1),
  basics: z.object({
    name,
    headline,
    summary,
    location,
    avatar,
    contacts,
    links,
  }),
  sections: z.object({
    experience: z.array(experienceItem),
    education: z.array(educationItem),
    projects: z.array(projectItem),
    skills: z.array(skillGroup),
    writing: z.array(writingItem),
    certifications: z.array(certificationItem),
    awards: z.array(awardItem),
    languages: z.array(languageItem),
    custom: z.array(customSection),
  }),
});
```

Non-negotiable schema rules:

- **Every item has a stable `id`** (generated once, never reused). Documents
  reference items by id; connected sources upsert by id; deltas patch by id.
- **Every item has `source` provenance** (`manual` | `github` | `linkedin` |
  …) so sync can distinguish "imported and untouched" from "user edited"
  (edited items are never overwritten by a re-sync).
- **`custom` sections exist from day one** so users are never blocked by the
  schema, and so we learn which fields to promote to first-class.
- Dates are ISO strings with optional day/month precision; rich text is a
  constrained subset (bold/italic/links), stored as structured content, never
  raw HTML.

### Schema versioning

`schemaVersion` is stored inside the profile data. `domains/profile` exports a
single `migrateProfile(data): Profile` that upgrades any historical version to
the latest through a chain of pure `v(n) → v(n+1)` functions.

- **Readers migrate, writers persist latest.** Anything loading a profile runs
  `migrateProfile` first; anything saving writes the current version. Old rows
  upgrade lazily on next write — no big-bang migrations of JSONB blobs.
- Migrations are pure functions with fixture-based tests (a stored corpus of
  real-shaped v1, v2… profiles must all migrate cleanly).

### Draft / publish

Profiles have a mutable **draft** and immutable **published versions**:

- Editing in the dashboard mutates the draft (autosave). The draft carries a
  monotonic `draftRev`; **every autosave sends the base revision it edited
  from, and a stale write is rejected** (the client refetches and rebases).
  Two open tabs must never silently clobber each other — optimistic
  concurrency is part of the engine, not an editor nicety.
- **Publish** snapshots the draft into an immutable `profile_versions` row and
  points the live site/exports at it.
- Public portfolios and cached PDFs always render a _published version_, which
  makes cache keys trivial (version id) and gives users a safety net: the live
  site never shows a half-finished edit. Preview renders the draft.

Storage details (tables, JSONB layout) are specified in
[07-storage](07-storage.md).

### The ProfileView projection

Templates and renderers never see the storage shape. `domains/profile` exports
a **ProfileView**: a read-only, denormalized projection built by applying a
Document's selection and deltas to a Profile version. ProfileView is the
_only_ contract templates depend on (via the Template SDK), which lets the
storage schema evolve independently of every shipped template.

## Tradeoffs

- **JSONB document vs. fully relational sections.** We store profile content
  as one validated JSONB document (with relational metadata around it). This
  costs us in-database querying of individual items ("all users who know
  Rust") and per-item foreign keys. It buys us: schema evolution in code
  instead of migrations, one atomic read per render (the hot path), trivial
  snapshotting for draft/publish, and a schema that stays aligned with the Zod
  definition. Item-level querying is an analytics/search concern we can solve
  later with generated columns or a search index — not worth normalizing the
  core for.
- **Deltas add complexity.** Per-document overrides (reworded bullets for one
  job application) mean rendering must apply a patch layer. The alternative —
  letting a tailored resume own its text — silently forks the data and kills
  the sync promise. Deltas are bounded complexity in one place
  (`buildProfileView`) versus unbounded divergence everywhere.
- **Draft/publish doubles the states to reason about**, but removes the far
  worse problem of live sites reflecting keystrokes, and it is the foundation
  for version history later.

## Future Scalability

- **New outputs are free.** A cover letter, JSON Resume export, or API
  response is a new Document type + projection — the Profile is untouched.
- **AI features operate on structure.** AI rewriting proposes _deltas_ against
  items (reviewable, revertible), and resume optimization scores a
  ProfileView — both slot into existing concepts.
- **Version history / rollback** falls out of immutable published versions.
- **Team workspaces / organizations** wrap Profiles in an ownership layer;
  nothing in the engine assumes user == owner.
- **Public API** exposes ProfileView projections, not storage rows.

## Implementation Strategy

1. Create `domains/profile` (`@resfolio/profile`): Zod schema v1, inferred
   types, `migrateProfile`, `buildProfileView`, and pure helpers
   (add/update/reorder items). No framework imports.
2. Fixture corpus + Vitest coverage for schema validation, migration chain,
   and view building (deltas, selection, ordering).
3. Wire storage per [07-storage](07-storage.md): `profiles`,
   `profile_versions`, `documents` tables via Drizzle.
4. Dashboard editor reads/writes the draft through Server Actions that call
   domain functions ([06-api-architecture](06-api-architecture.md)).
5. Connected-source sync (GitHub first) as a later phase: import → upsert by
   provenance, never overwriting `manual` or user-edited items.

## Open Questions

- Exact field lists per section item (finalize during editor implementation;
  start from JSON Resume's vocabulary and extend).
- Rich-text representation: constrained Markdown vs. minimal structured AST.
  Leaning Markdown-subset for portability; decide before the editor ships.
- Whether cover letters are Documents with free-form blocks or a distinct
  concept (defer until the feature is scheduled).

## Alternatives Considered

- **Fully relational schema (a table per section type).** Safest for
  querying, painful for evolution: every schema tweak is a DB migration, reads
  fan out across many tables, and snapshots/versioning require copying rows
  across all of them. Rejected for V1; revisit only if item-level querying
  becomes a real product need.
- **Event sourcing (profile = fold of edit events).** Gives perfect history
  and audit, but is heavy machinery for a document a single user edits.
  Draft/publish snapshots deliver the useful 20%.
- **Outputs own their data, "sync" copies it forward.** How most resume
  builders work; explicitly the thing Resfolio exists to not be.
- **JSON Resume as the canonical schema.** Good vocabulary, but too narrow
  (no portfolio concepts, no provenance, no custom sections) and we'd be
  coupled to an external standard's pace. Instead: our schema, with a JSON
  Resume _exporter_ as one more projection.

## Final Recommendation

Adopt the three-layer model — **Profile (canonical, versioned Zod schema in
`domains/profile`) × Document (id-referencing view + deltas) × Template
(presentation)** — with JSONB storage, lazy read-time migrations,
draft/publish versioning, and ProfileView as the only contract exposed to
renderers. This is the simplest architecture that keeps "one profile, many
outputs" true forever, and every later document builds on it.
