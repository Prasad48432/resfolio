# @resfolio/storage — binary storage

Every uploaded or generated binary (docs/architecture/07-storage.md), over
Cloudflare R2. The only code in the repository that touches R2 or the `assets`
table.

## Layering

- **Root (`.`) is pure.** The kind/policy table (`ASSET_KIND_SPECS`), key
  construction, and URL resolution. No network, no database, no `sharp`, no
  `node:crypto`. This is what lets a client component read the same size limit
  the server enforces instead of keeping a second copy that drifts.
- **`./server`** is the AWS SDK, `sharp`, and the `assets` table. It owns both
  the objects and the rows because every operation has to move them together.

## Rules that are load-bearing

- **Keys are owner-first**: `u/{profileId}/{segment}/{sha256}.webp`. Deleting
  everything a profile owns is one prefix delete — no index, nothing missed. A
  type-first layout reads better in a bucket browser and turns the one storage
  operation we are obliged to get right into a scan of every prefix. Do not
  reorder these segments.
- **The filename is the content hash.** Re-uploading the same file is
  idempotent, objects are served `immutable` for a year, and "replace" is
  unambiguous. All three break if a random id is substituted.
- **Ordering: write object → write row; delete row → delete object.** Both
  leave the recoverable failure (an unreferenced object the sweep collects)
  rather than the unrecoverable one (a row pointing at nothing).
- **An asset may only be deleted once no live content references it — and
  "live" includes every published version.** Replacing a singleton
  (avatar, banner) therefore only **supersedes**: it clears `referenced_at` and
  deletes nothing. `profile_versions` are immutable snapshots that keep
  rendering the URL they were published with, so eagerly deleting the previous
  avatar broke the _published_ site while the draft looked perfect — a 404 for
  the portrait that nothing reported (found in live data, 2026-07-18). For the
  same reason `collectOrphanedAssets` takes a **required** `protectedKeys` set
  with no default: an optional one would make the dangerous call the short one.
  `referenced_at` is a hint; the live key set is the authority.
- **Uploads are proxied, never presigned.** The server must see the bytes:
  re-encoding is what strips EXIF/GPS, discards appended payloads and polyglot
  files, and verifies the file is the type it claims. A content-type header is
  a claim, not evidence. Doc 07 originally said presigned; it was revised, and
  the reasoning is recorded there.
- **SVG is not an accepted upload type.** It is a document format that can
  carry `<script>`; serving one from our origin hands a user script execution
  against it.
- **`assetKeyFromUrl` ignores the origin, deliberately.** The orphan sweep
  learns what is live by parsing URLs out of content. Anchor that parse to the
  configured `R2_PUBLIC_BASE_URL` and the day the delivery origin moves
  (r2.dev → custom domain — expected, since Cloudflare rate-limits r2.dev and
  advises against it in production), every stored URL stops matching, every
  live asset looks orphaned, and the sweep deletes users' images. Matched on
  the key portion, the swap is a cosmetic change. `keys.test.ts` guards this.
- **The orphan sweep needs its grace period.** There is a real window between
  an upload finishing and the debounced autosave that references it. 24 hours
  is far longer than that window and still bounded. Shortening it to "be
  tidier" deletes live assets mid-edit.
- **Storage is optional infrastructure.** Absent credentials means uploads are
  unavailable and the UI hides the control — never a crash at the moment a
  user picks a file. `isStorageConfigured()` is the gate.

## Adding an asset kind

One entry in `ASSET_KIND_SPECS` (segment, max bytes, dimensions, whether the
slot is a singleton) and nothing else. The upload route, the cleanup rules and
the uploader's guidance all read from it. `singleton: true` is what makes
"replace the old one" automatic — set it correctly or that kind leaks an
object per edit.

## Reference-marking is the app layer's job

`markAssetsReferenced` is called from the dashboard's save actions
(`lib/assets.ts`), not from the profile or portfolio domains: those domains
have no business knowing what R2 is, and coordinating two of them around one
user action is what a Server Action is for. It is deliberately **best-effort** —
a failed mark must never fail the user's save, because the next save re-marks
the same keys well inside the sweep's grace period.

## Tests

`keys.test.ts` covers the pure layer exhaustively, including `parseAssetKey`
rejecting traversal and malformed input — it is the ownership check, so a key
that parses into the wrong owner is a cross-tenant delete. The server layer is
covered by integration exercise against a real bucket rather than mocks of the
AWS SDK, which would only test our mocks.
