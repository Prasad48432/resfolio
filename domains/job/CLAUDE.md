# @resfolio/job — job match sessions

One job the user is working on: the posting, how well their profile matched it,
what they changed for it, and the resume and letter that came out of it
(`docs/architecture/13-ai-layer.md`, Phase 7).

## What a row is

**A job, not an AI result.** Matching is how a row gets created today; it is not
what a row _is_. The same row is the Application Tracker's row — `status` is
written on every save from the first one, so **Saved → Applied → Interviewing →
Offer / Rejected / Ghosted** was a UI and a state machine over data that already
existed rather than a migration over rows that predate the idea. The tracker
(`/jobs`) was built on 2026-07-28 and that bet paid: it needed no backfill.

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
  as the user works through a posting — matched, enhanced, given a resume, given
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
  resume is `Profile × config` and is edited afterwards; snapshotting one here
  would leave a job pointing at a version that exists nowhere else. Deleting the
  resume leaves the job — the application still happened.
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
  them. Listing forty jobs must not mean loading forty postings. `profile_changes`
  is not among them either — `hasEnhancement` comes from a
  `jsonb_array_length(...)` computed in SQL, because the column holds up to 200
  whole `ProfileChange` objects and a list has no use for eight thousand of them.
  `getJobMatch` already has the array, so it derives the count locally rather than
  asking the database twice.
- **`hasEnhancement` is on the _summary_, not only the record**, and that is the
  point of it: the chat renders a match card per tool result, and "Enhance profile
  for this job" is the wrong thing to show above a profile already enhanced for
  that exact posting. A card that had to load the whole record to decide would
  show the button first and then take it away.
- **`ENHANCE_CONFIRM_THRESHOLD` lives here, not in the dashboard.** It describes
  what a job match _means_ — under it, rewriting a career record to chase a role
  it does not fit has to be deliberate rather than easy — and the confirmation
  copy quotes the number.
- **`status_history` is appended, never replaced, and seeded on insert only.**
  It is a baseline in exactly the way `initial_score` is: `saveJobMatch` writes
  the first event in `values(...)` and never in `set`, so a later save cannot
  erase the journey it is meant to record. `setJobStatus` is the only thing that
  appends, and it writes the status and the history in **one** update — the board
  reads the column, the flow reads the array, and anything able to change one
  without the other is a source of a diagram that disagrees with the board beside
  it.
- **A move to the status a job already holds records nothing**, and reports
  success. Dropping a card back into the column it came from is the most ordinary
  thing to do with a kanban board and it is not an event; counting it would put a
  self-loop in the funnel. Success rather than `false` because the caller asked
  for a state the row is in — an optimistic board that put the card back on a
  falsy return would be undoing a move the user can see already happened.
- **A row predating the column gets a synthesised single event on read**
  (`readStatusHistory`), never a backfill. Inventing transition timestamps for
  changes nobody observed would put fiction in the table, where it outlives the
  migration that wrote it and every later read trusts it. The fabrication here is
  confined to one hop that is true by construction and disappears on the next
  move.
- **`updateJobDetails` is a second, narrower door — not a loosening of
  `saveJobMatch`.** That function requires the job description, rightly: every
  derived thing on the row comes from it and a save allowed to omit it is a save
  that can blank it. Correcting a company name must not mean posting four
  thousand characters back to the server, hence this. It takes four fields and
  will never take a score: a tracker whose match percentage you can type is a
  tracker whose numbers mean nothing.
- **`buildJobFlow` takes `JobJourney`, not `JobMatchSummary`.** It reads the
  sequence of statuses and nothing else — no timestamp, no score, no title — and
  saying that in the type is what lets the dashboard run it in the browser
  against its own display DTO. That is not a detail: the board moves a card
  optimistically, and a flow computable only on the server would contradict it
  until the next navigation.
- **`saved` is excluded from the flow and `ghosted` is kept apart from
  `rejected`.** A posting read and never applied to is a bookmark, and counting
  bookmarks in a funnel makes every rate below it look worse than it is. An
  application nobody answered is a fact about the employer rather than about the
  candidate, and merging it into `rejected` hides the more actionable of the two.
- **`summarizeJobFlow` states no rate below `MIN_JOBS_FOR_RATES`.** "0% interview
  rate" off two applications describes the sample size, not the job search — and
  the user is about to paste it somewhere.

## Testing

`pnpm --filter @resfolio/job test` — the pure half only. The repository has no
integration test yet; when one is added, follow `@resfolio/blog`'s
`*.integration.test.ts` split so `pnpm test` stays database-free.
