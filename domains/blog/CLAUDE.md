# @resfolio/blog — the blog domain

Natively authored posts (docs/architecture/07-storage.md, 01-profile-engine.md).
A post is profile-owned writing with its own body, slug, and draft/published
state. Published posts are **projected into the Profile's Writing section** by
`withNativePosts` + `buildProfileView`, so every renderer sees one Writing list
in which a native post and an article imported from RSS are the same shape.

## Why posts are a table, not a profile section

The Profile is one JSONB document that the editor rewrites in full on a
debounced autosave and that `profile_versions` snapshots in full on every
publish. Post bodies are unbounded prose: carried inside that document, every
keystroke in the _profile_ editor would rewrite every post, and every published
version would duplicate all of them. Posts are their own rows for the same
reason `documents` and `sites` are.

This does not weaken "the Profile is the source of truth". The Profile owns
**identity**; a post is profile-owned content (`profile_id`, cascade delete),
and the integration point is the **ProfileView** — what renderers actually
consume.

## Layering — same shape as `@resfolio/profile`

- **Root (`.`) is pure and framework-free.** Body schema, derived-value
  helpers, post schema, the projection. No database, no TipTap, no `node:*`.
  That is what lets the editor island import `blogBodySchema` and validate
  exactly what the server will, rather than keeping a second copy that drifts.
- **`./server` is the only database-aware surface.** CRUD over `blog_posts`.
  Every function takes `userId` and scopes to the profile that user owns. The
  exceptions are `listPublishedPosts(profileId)` and
  `getPublishedPostBySlug(profileId, slug)`, called by the view builder and the
  (future) render host without a session — both return **only published**
  posts, so there is no posture in which either can leak a draft.

## The body is TipTap JSON, not the profile's rich text

`@resfolio/profile`'s `richTextSchema` is a deliberately tiny Markdown subset
(bold, italic, links, hyphen lists) chosen so a résumé survives plain-text ATS
extraction. A post needs headings, code blocks, task lists, images with captions
and callouts — none expressible in that grammar, and widening it would widen it
for résumés too, where the constraint is the point.

**Raw HTML is not filtered, it is unrepresentable.** A node is valid only if its
`type` is in the whitelist, and no node type carries markup. Same reasoning as
`ACCEPTED_IMAGE_TYPES` excluding SVG (doc 07): make the dangerous thing
impossible to express rather than something a filter has to catch.

`MAX_BODY_DEPTH` bounds nesting because both validation and rendering recurse —
without it, a pathologically nested paste is a stack overflow rather than a
validation error.

## Rules that are load-bearing

- **`readingMinutes` is derived, never accepted.** `updateBlogPostSchema` has
  no such field _by construction_ — a field a client cannot send is a field
  that cannot drift from the content it describes. The repository recomputes it
  on every body write. Code blocks are excluded from the count: a 300-line
  config dump is not read word by word, and counting it produces "22 min read"
  on a post someone skims in three.
- **`publishedAt` is stamped once**, on the first transition to `published`,
  and never moved. Re-publishing an edited post does not restart its life.
- **The excerpt is only derived while the author has not written one.**
  Deriving it unconditionally makes an excerpt that differs from the opening
  line impossible to keep.
- **Images are cleaned up by reference counting, never by ownership.** Keys are
  content hashes deduped per `(owner, kind, hash)`, so an image used in two
  posts is **one** object with **one** row. Deleting a post's whole key set
  would blank the other post's image, silently and unrecoverably. `deletePost`
  therefore deletes the row **first**, then releases its keys against what
  every _remaining_ post references (`releaseAssetKeys` in
  `@resfolio/storage/server`). Computing the protected set before the delete
  would count the post's own keys as live and free nothing.
  The same release runs on edit, for a replaced cover and for images dropped
  out of the body.
- **The image ceiling is enforced in the repository, not only at upload.**
  Upload is the friendly check; the repository's is the one that cannot be
  bypassed by a body assembled another way (a pasted copy of another post, a
  future importer). The limit is a parameter with `DEFAULT_MAX_IMAGES_PER_POST`
  as fallback — the dashboard passes the env-configured value.
- **Slugs are unique per profile**, enforced by a DB unique index _and_
  resolved with `uniqueSlug` on create, so two posts made from one title cannot
  race onto the same URL.
- **`source` stays `"manual"` in the Writing projection.** A native post was
  written by the user here, which is what that value means; adding a
  `"resfolio"` source would widen an additive-only enum to describe something
  the vocabulary already covers.

## Tests

Two suites, deliberately split (the same split `@resfolio/storage` uses):

- **`pnpm test`** — hermetic unit tests over the pure layer: the node
  whitelist (including every unsafe link scheme and the depth ceiling), the
  derived helpers, and the Writing projection through the real
  `buildProfileView`.
- **`pnpm test:integration`** — the repository against a **real Postgres**
  (dev database up; `DATABASE_URL` set). Not in `pnpm test`, because it needs a
  database and the default suite stays hermetic.

The integration suite exists for one reason above all: **reference-counted
image cleanup destroys user data silently when it is wrong.** Its two key cases
— deleting a post that shares an image with another, and replacing a cover
another post still uses — were confirmed to _fail_ when the protected-key set
is stubbed out, so they are not vacuous. Mocking the database would only have
tested the mock's opinion of the dedupe.

## Dependencies

`@resfolio/database`, `@resfolio/profile` (types for the projection), and
`@resfolio/storage` (server only, for key release). **Never** an app, a
template, or TipTap. The dependency on `profile` runs one way — `profile` must
not learn about `blog`, which is why `withNativePosts` lives here and is applied
_before_ `buildProfileView` rather than inside it. That keeps the view builder
pure, synchronous and database-free, which is what lets the dashboard run it in
the browser.
