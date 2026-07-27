# @resfolio/job — job match sessions

One job the user is working on: the posting, how well their profile matched it,
what they changed for it, and the résumé and letter that came out of it
(`docs/architecture/13-ai-layer.md`, Phase 7).

## What a row is

**A job, not an AI result.** Matching is how a row gets created today; it is not
what a row *is*. The same row is the Application Tracker's row — `status` is
written on every save from the first one, so **Saved → Applied → Interviewing →
Rejected / Offer** is a UI and a state machine over data that already exists,
not a migration over rows that predate the idea.

That is why this is not in `@resfolio/ai`. A tracked application has nothing to
do with a model, and `domains/ai/CLAUDE.md` says that package is saved chat
sessions and nothing else.

## What does not go here

**No prompts, no provider, no model call, no env read.** All of that stays in
`apps/dashboard/lib/ai/`, where the product decisions are — the same rule
`@resfolio/ai` follows. If the thing you are adding talks to a model, it does not
belong in this package.

## Two schemas, deliberately

`apps/dashboard/lib/ai/job-analysis.ts` describes **what a model is asked to
produce**: citations as raw id strings, levels it claims. `storedAnalysisSchema`
here describes **what survived verification**: evidence that resolved to a real
profile item, levels demoted to `gap` when it did not, and the arithmetic.

Collapsing them would mean either this package knowing what a prompt looks like,
or an unverified claim being storable. The dashboard maps one to the other after
`verifyRequirement` has run.

## Things not to undo

- **`saveJobMatch` merges; it does not replace.** One row is written repeatedly
  as the user works through a posting — matched, enhanced, given a résumé, given
  a letter — and each of those saves knows about one field. An absent key means
  "leave it alone". Spread the whole input into `set` and the cover-letter save
  silently clears the score.
- **`initial_score` is written on insert only.** It is the baseline the
  "74% → 86%" claim is measured against; a baseline that moves is not one.
- **`chat_session_id` carries no foreign key on purpose.** Chat history is
  disposable — "Clear history" deletes every transcript — and a job the user is
  tracking must not go with the conversation that happened to start it. A
  dangling id is correct: the job outlives its origin story. It also means the id
  is not a claim about ownership, so every query scopes by profile too.
- **`resume_document_id` is a reference, not a copy** (`on delete set null`). A
  résumé is `Profile × config` and is edited afterwards; snapshotting one here
  would leave a job pointing at a version that exists nowhere else. Deleting the
  résumé leaves the job — the application still happened.
- **`normalizeJobUrl` rejects, it does not sanitise.** The value comes from a
  chat message a model read and is rendered as a link the user clicks;
  `javascript:` is the one string that turns a stored field into script
  execution. There is no useful `javascript:` posting to salvage. `match.test.ts`
  guards it.
- **The upsert's `setWhere` is scoped to the owner**, for exactly the reason
  spelled out in `@resfolio/ai`'s repository: `id` is both the conflict target
  and the primary key, so the insert's own `profile_id` never gets a say on
  conflict.
- **`listJobMatches` names its columns**, and `job_description` is not among
  them. Listing forty jobs must not mean loading forty postings.
- **`ENHANCE_CONFIRM_THRESHOLD` lives here, not in the dashboard.** It describes
  what a job match *means* — under it, rewriting a career record to chase a role
  it does not fit has to be deliberate rather than easy — and the confirmation
  copy quotes the number.

## Testing

`pnpm --filter @resfolio/job test` — the pure half only. The repository has no
integration test yet; when one is added, follow `@resfolio/blog`'s
`*.integration.test.ts` split so `pnpm test` stays database-free.
