# @resfolio/document — the document engine

Documents are `Profile × config` renderings (docs/architecture/07-storage.md,
09-rendering-pipeline.md): a template + presentation `config` + a `view`
(ViewDefinition — section selection/order/deltas) + a `visibility`. **Content
is never stored here** — the Profile stays the single source of truth; a
document only records how to project and present it. `kind` discriminates
future document types (cover letters, …); only `resume` exists today.

## Layering — same shape as `@resfolio/profile`

- **Root (`.`) is pure and framework-free.** Schema, types, and the
  `newResumeDocumentInput` helper. No database, no `node:*`, no framework. Safe
  to import (for types) from the client editor island. Template `config` is
  **opaque here** — each template re-validates it with its own Zod schema at
  render (doc 05) — so it is modelled as an arbitrary JSON object and never
  interpreted in this package. That keeps the domain presentation-agnostic and
  free of any template dependency (templates describe presentation only).
- **There is no `./token` subpath.** It held a 5-minute HMAC that guarded the
  print route; it is deleted (doc 02). A resume now has a **permanent URL**
  gated by the row's own `visibility` — an expiring capability was the wrong
  instrument for a document whose entire purpose is being sent to people, and
  it caused five of that route's six 404 paths. The remaining cross-app calls
  (PDF export, revalidation, the private draft render) are **server-to-server**
  and carry a plain `RENDER_SECRET` bearer, never a user-facing token. The
  portfolio draft preview keeps its own token (`@resfolio/portfolio/token`)
  because that one genuinely goes in a browser URL.
- **`./server` is the only database-aware surface.** CRUD over the `documents`
  table. Every function takes `userId` and scopes to the profile that user owns
  (ownership enforced here, never assumed — doc 06/10). The one exception is
  `getDocumentForRender(id)`, which the render host calls without a session:
  it returns `visibility` and `ownerUserId` alongside the render spec so the
  caller _cannot forget_ the access decision, and a private document still
  resolves (the host needs the row to say "private" rather than 404 — 404 would
  leak the difference between "no such resume" and "not yours").

## Rules

- Depends on `@resfolio/database` + `@resfolio/profile` (for `viewDefinitionSchema`
  / `ViewDefinition`) — never on any template or app.
- Do not add content fields. If a resume needs different content, that is a
  ViewDefinition delta on the Profile, not a copy of the data.
- **`visibility` is two states on purpose**: `public` (default) | `private`.
  No "unlisted" tier — the id is already unguessable, so it would add ceremony
  without a capability. Public is _not_ indexable; that is `apps/sites`' job
  (`X-Robots-Tag` + `robots.txt`), because a resume carries contact details and
  has no `discoverable` toggle the way a Site does.
