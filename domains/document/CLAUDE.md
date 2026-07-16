# @resfolio/document — the document engine

Documents are `Profile × config` renderings (docs/architecture/07-storage.md,
09-rendering-pipeline.md): a template + presentation `config` + a `view`
(ViewDefinition — section selection/order/deltas). **Content is never stored
here** — the Profile stays the single source of truth; a document only records
how to project and present it. `kind` discriminates future document types
(cover letters, …); only `resume` exists today.

## Layering — same shape as `@resfolio/profile`

- **Root (`.`) is pure and framework-free.** Schema, types, and the
  `newResumeDocumentInput` helper. No database, no `node:*`, no framework. Safe
  to import (for types) from the client editor island. Template `config` is
  **opaque here** — each template re-validates it with its own Zod schema at
  render (doc 05) — so it is modelled as an arbitrary JSON object and never
  interpreted in this package. That keeps the domain presentation-agnostic and
  free of any template dependency (templates describe presentation only).
- **`./token` is the signed render token** (`node:crypto`, server-only). Shared
  by every minter and verifier so the HMAC scheme lives in exactly one place:
  `apps/sites` verifies the token guarding the print route; the dashboard and
  the export scripts mint it. The payload names a profile snapshot
  (`source`/`ref`) and how to render it (`document`: an **inline** spec for the
  fixture/dev path that needs no DB, or a **stored** id the host looks up).
  Never bundle into a client — import document *types* from the root instead.
- **`./server` is the only database-aware surface.** CRUD over the `documents`
  table. Every function takes `userId` and scopes to the profile that user owns
  (ownership enforced here, never assumed — doc 06/10). The one exception is
  `getDocumentForRender(id)`: the render host calls it with the signed short-TTL
  token as the capability, not a session.

## Rules

- Depends on `@resfolio/database` + `@resfolio/profile` (for `viewDefinitionSchema`
  / `ViewDefinition`) — never on any template or app.
- Do not add content fields. If a resume needs different content, that is a
  ViewDefinition delta on the Profile, not a copy of the data.
