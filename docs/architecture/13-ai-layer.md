# 13 — AI Layer

Status: Proposed (Phases 1–6 implemented)

## Problem Statement

Every resume product now has a "improve this with AI" button, and almost all of
them do the same thing: send a blob of text to a model, take whatever comes
back, and write it into the document. That is cheap to build and structurally
incapable of being trusted — the model is one prompt away from adding a job the
user never had, and nothing between it and storage would notice.

Resfolio can do something the text-blob products cannot, because it made a
different bet earlier: **the Profile is structured truth, and every output is a
projection of it** (docs 01, 09). A model operating on that structure can
propose a change to one field of one item, addressed by its stable id, and the
platform can validate that proposal against the same Zod schema the editor uses
before a human ever sees it. The AI becomes an action layer over the domain
rather than a text generator bolted onto it.

The design problem is therefore not "how do we call a model". It is: how do
model outputs enter the domain, what stops them fabricating, and what does the
user actually approve.

## Proposed Architecture

### The rule: the model proposes, the domain disposes

There is exactly one pipeline, and no code path skips a stage:

```
user intent
  → context built from the Profile (never the raw DB, never unbounded history)
  → model call (AI SDK → provider)
  → structured proposal
  → Zod validation against the profile's own schemas
  → business validation (the no-fabrication guard)
  → review UI showing before / after / reason
  → user approves individual changes
  → existing domain edit helpers (@resfolio/profile)
  → saveDraft
```

**`LLM → database mutation` does not exist anywhere in this design**, and the
thing that guarantees it is not discipline: the AI layer has no database access.
It produces a proposal object. The only code that can write a profile is
`@resfolio/profile/server`, which takes a validated `Profile`, and the only way
to construct one of those from a proposal is through the pure edit helpers,
which re-validate every field.

### No fabrication is a schema property, not a prompt

The prompt asks the model not to invent facts (`lib/ai/system-prompt.ts`), and
that is necessary — a model fighting its instructions produces output that gets
rejected, which is a worse experience than one that cooperates. But the prompt
is not the guarantee. Four structural properties are:

1. **The proposal type has no "add" variant.** A `ProfileChange` addresses an
   _existing_ item by its stable id and replaces a field's value. There is no
   shape in which a model can express "add Kubernetes to their skills". The one
   place a missing requirement can go is `gaps[]`, which is a report, not a
   mutation. This mirrors `@resfolio/integrations`' rule that a connector may
   never propose the user's identity — enforced by the absence of a field
   rather than by a policy someone has to remember (doc 12).
2. **Only prose is proposable.** `PROPOSABLE_ITEM_FIELDS` allowlists the fields
   that are _writing_ — summaries, descriptions, highlights, and the two
   set-valued ones. The fields that are _facts_ (company, role, institution,
   dates, URLs, issuer, awarder, fluency) are absent, so a rewrite can sharpen
   how a job is described and cannot change which job it was. Whole sections
   are absent for the same reason: `certifications` and `languages` are facts
   end to end.
3. **Every proposed value re-parses through the section's own schema.** The
   same `richTextSchema` that rejects raw HTML from a user's keyboard rejects it
   from a model. Model output is hostile input; it is not privileged (doc 10).
4. **Set-valued fields must not grow, and prose lists must not lengthen.** For
   `skills` / `technologies` a proposal's array must be a subset of the existing
   one, compared case-insensitively so a spelling fix is not mistaken for a new
   claim — reordering and pruning are allowed, adding is not, and a swap that
   keeps the count identical is caught because the rule is membership, not
   length. For `highlights` membership means nothing (the bullets are rewritten
   wholesale), so the rule is the count: three bullets may become two, never
   four. A fourth bullet is a fourth claim.

Users are the fifth layer: nothing applies without an explicit accept.

The apply path re-runs the whole guard rather than trusting the review that
produced it, and re-runs it against the profile _as it stands after the previous
change in the batch_. Both matter: the edit helpers alone would accept a grown
`skills` array (it is valid data), and two individually-legal changes could
otherwise restore what the first one pruned.

### Tailoring writes a `ViewDefinition`, never the Profile

This decision is already made and already implemented — the AI layer just uses
it. `viewDefinitionSchema` (doc 01) carries `deltas` (per-item field overrides
keyed by stable id) and `basics` (a tailored summary), and `documents.view`
stores one. So:

- **A job-tailored resume is a document whose `view` carries AI-authored
  deltas.** The canonical Profile is untouched. Ten applications produce ten
  view definitions and zero copies of the user's career.
- **A genuinely canonical improvement** — "this bullet is just better" — is a
  separate, explicit promotion through the proposal flow above.

Two destinations, one review UI, and the default is the safe one.

**Two destinations became one question (2026-07-28).** The design above was right
about the destinations and wrong about how they reach the user: Phase 5 shipped
"Tailor for this job" in the artefact panel and Phase 7 shipped "Enhance profile
for this job" on the match card, as peers, in different places, with no stated
relationship. Two entry points for two destinations reads as two ways to do one
thing — and pressing both spends two model calls rewriting the same sentences,
the second layered on the first, which is precisely the ratchet the guard's
canonical base exists to prevent, arriving through the UI instead.

So the destination is now **asked once, up front**, by a single "Optimise for this
job" (`components/ai/optimise-for-job.tsx`): _My profile_ (permanent, every
output, written conservatively) or _This resume only_ (overrides on one document,
free to be pointed). One choice, one model call, one review. Nothing about the
guard, the schemas or the two write paths changed — this is a UI decision about
which question gets asked, and it is the question this section was already the
answer to.

Two consequences worth recording:

- **Ordering belongs to the resume branch and has no profile equivalent.** A
  Profile has nowhere to record "for this posting, lead with Projects" — section
  and item order is a property of a resume. That is the data model, not a
  simplification.
- **The `<70%` confirmation applies to the profile branch only.** It exists
  because rewriting a _career record_ to chase a role it does not fit should be
  deliberate. Pointing one document at a long shot is an ordinary thing to do with
  a document, and one Reset undoes it.

**The guard does not relax for the safer destination** (Phase 5). The temptation
is real: a delta is scoped to one document, reversible, and never touches the
source of truth. But the tailored copy is the one that gets sent to the employer,
so a fabricated bullet there is _more_ consequential, not less. So
`reviewProfileChanges` is reused verbatim — and it fits with no adaptation,
because a `ProfileChange` already **is** a delta coordinate: item id, field name,
replacement value is exactly what `deltas` is keyed by. There is no second change
schema. Three properties follow:

- **The base is always the canonical Profile**, never the already-tailored view.
  The rule is "may not claim what the user did not write", and the Profile is
  what they wrote. A view-relative base would let tailoring ratchet — each pass
  legal against the last, the tenth unrecognisable against the first.
- **Every change in a batch is checked against the same immutable base.**
  `applyProfileChanges` must re-check against the _evolving_ profile because it
  mutates it; deltas mutate nothing, so no sequencing hazard exists and none is
  invented.
- **Tailoring may reorder and may never hide.** The plan schema has no `exclude`
  and no `include`, so "drop the retail job to fit one page" is unrepresentable.
  This is the mirror of the no-add rule and it matters for the same reason: a
  role silently missing from a resume someone then sends is a lie by omission the
  platform helped tell. Hiding stays a deliberate human act in the resume's own
  Sections panel — which is also why reordering needs no per-item consent, since
  an ordering cannot state anything.

**Applying tailoring is live.** Documents have no draft/publish split, so a
public resume changes at its URL the moment a change is accepted. The UI says so
before the click rather than after.

**Tailoring is cumulative, and that is a trap the feature has to answer.** A pass
for a new posting leaves the previous pass' deltas on every field it does not
touch, so a resume tailored twice is tailored for neither. Hence
`countTailoredFields` on screen and `clearTailoring` beside it — which resets
`deltas` and `basics` only, never the `sectionOrder`/`include`/`exclude` the user
chose themselves.

### A cover letter's vocabulary is checked, because nothing else can be

Phase 6 is the workflow that defeats every mechanism the earlier phases rely on,
and it has to be answered rather than excused. A proposal is safe because it has
no add variant, only writes allowlisted prose fields, cannot lengthen a list, and
re-parses through the profile's own Zod schema. **A cover letter has access to
none of that**: it is new prose by definition, addresses no field, and cannot be
validated against a schema describing someone's career. "Do not fabricate" is
exactly the instruction this document refuses to treat as a guarantee — and a
letter is the highest-stakes text the product produces, since it is sent unedited
to a stranger who is deciding.

Three structural answers, in ascending order of what they buy:

1. **The envelope is not the model's to write.** There is no `greeting` and no
   `signoff` field; Resfolio composes both, from the recipient the user typed and
   the name in their own profile. A model cannot invent "Dear Ms. Chen" if there
   is nowhere to put it, and cannot misspell a name it was never asked for. Same
   move as `ProfileChange` having no add variant: delete the field, delete the
   failure.
2. **Body paragraphs cite profile items, `evidence` before `text`.** A paragraph
   claiming experience names the entries it rests on, and one whose citations
   resolve to nothing is surfaced as ungrounded — Phase 4's rule applied to prose
   instead of to a verdict. It is not _removed_: a letter with a hole in the
   middle is worse than one with a warning beside it.
3. **The letter's vocabulary is verified deterministically.** Every name and every
   number must appear in the **profile or the posting**; anything in neither was
   invented, and is flagged.

The third is the one that matters, and the insight is that **the posting belongs
in the haystack**. A letter must be free to say "the Senior Engineer role at
Acme" — vocabulary legitimately absent from the user's career and present in the
job description they are answering. Union the two and the rule becomes precise,
checkable, and — unusually — _statable to the model as an instruction it can
comply with_: every name and number you write must already appear above. The
prompt and the check are one rule expressed twice, not a request plus an unrelated
audit, which is why a compliant letter yields an empty flag list rather than a
plausible-looking one.

Detection uses **sentence position, not a dictionary**. A capitalised word
mid-sentence is a name; the same word opening a sentence is ambiguous, and no
stoplist resolves that without either leaking fabrications or drowning the user in
false positives. A sentence-initial capital is therefore only flagged when
something else marks it — a digit, or an internal capital (`TypeScript`, `AWS`,
`iOS`), both of which mean "name" wherever the word sits. Three tolerances exist
purely to prevent _false_ flags, because a warning list with noise in it is a
warning list nobody reads: plurals, the numeric core of a figure (`40%` is
supported by a profile saying `40`), and case.

**What this does not catch**: a false sentence assembled entirely from true words
("I led the billing migration" when they worked on billing). Nothing short of the
user reading it catches that — which is why the letter is presented as a draft to
read rather than a file to send, why the checks are shown under it, and why
**nothing is persisted in Phase 6**. A clean result is also stated out loud
("every name and number here appears in your profile or the posting"), for the
same reason the proposal guard's refusal count is: a user who only ever sees the
warning version cannot tell a product that checked from one that shrugged.

### Match scores are computed, not generated

The model classifies each extracted requirement as `strong | partial | gap`.
**Application code does the arithmetic** (`strong = 1, partial = 0.5, gap = 0`).
A percentage produced by a language model is a fabricated statistic wearing the
costume of a calculation: it is not reproducible, not explainable, and not
defensible to a user who asks why. Having the model classify and the platform
count makes the number deterministic across re-runs of the same JD, and makes
the UI able to show its working — which it does, next to the number.

Two consequences fall out of the same principle:

- **A match must cite profile item ids, and unsupported matches are demoted.**
  `strong`/`partial` with no citation that resolves to a real item becomes a
  `gap`. A model that has decided someone is a good fit will cite an id it half
  remembers, and an unverifiable match is the same fabrication as an invented
  sentence — it just arrives as a score. The demotion count is shown, like the
  proposal guard's refusal count.
- **Keyword coverage is a string search, not a classification.** The model
  extracts the terms a posting leans on; whether each appears in the profile is
  computed. That search is word-boundary aware, because substring matching
  reports that a profile containing "Google" has "Go" — and telling someone
  their resume already says something it doesn't is the damaging direction of
  that error.

The **schema orders `evidence` before `level`**. Structured output is generated
in schema order, so the model has to find its support before it may state a
verdict — better reasoning, and the reason a streamed row never shows a level
that has not been checked yet.

### The house style is a shape, and the count is disclaimed twice

Rewrites now follow a stated formula: an experience highlight is
`[action verb] + [what] + [how, naming a real skill] + [the result]` in 15–25
words, and a project description is the same shape once. Eight _kinds_ of bullet
are listed — work delivered, a responsibility owned, a problem solved, a process
standardised, and so on — so that eight bullets under one role come out
structurally varied rather than as eight verb-first clones, which is what makes a
resume read as generated.

Two things about it are load-bearing, and both are refusals:

- **It is a shape, not a quota.** Handed a numbered list of eight patterns, a
  model reads it as an instruction to produce eight bullets, and the result is a
  profile that grew four claims nobody made. So the count is disclaimed in the
  formula itself _and_ by `CHANGE_LIMITS`, which follows it everywhere it is used
  — and the domain's growth rule refuses a longer `highlights` list
  independently, so a model that ignores both produces changes that are rejected
  rather than applied.
- **The `[result]` slot is where a metric gets invented.** "Reduced load time by
  40%" about a bullet that never carried a number is the single most damaging
  thing this product could do to someone in an interview. `TRUTHFULNESS` already
  forbids it in general; it is restated in the specific here, because this is the
  exact place a model reaches for one and a rule stated far from its temptation
  is a rule that loses. The instruction is to write the concrete outcome instead
  — and a shorter honest bullet beats one padded to the word count.

The formula is shared by all three workflows that rewrite prose (chat proposals,
resume tailoring, job enhancement) for the reason `CHANGE_LIMITS` is: a second
copy drifts, and the one that drifts is the one nobody rereads.

### Provider independence is one file

`lib/ai/provider.ts` is the only module in the repository that names a model
vendor. Everything downstream takes the AI SDK's `LanguageModel`. Swapping
providers, or running different models for different workflows, is editing that
file.

It resolves **two credentials, gateway first**: `AI_GATEWAY_API_KEY` (Vercel AI
Gateway — one credential for many providers, one place the spend is visible) or
`OPENAI_API_KEY` (direct). Either alone is a working configuration and nothing
downstream can tell which was used, which is the property that makes preferring
one safe. The gateway needs no extra dependency — `ai` re-exports
`createGateway` from a package it already carries — and its key is passed
explicitly rather than left to the SDK's ambient lookup, because an implicit
read would put a second `process.env` reader inside a dependency (doc 11).

The two paths address models differently: the gateway wants a
provider-qualified slug (`openai/gpt-5-mini`), the direct provider a bare id
(`gpt-5-mini`), so `AI_MODEL`'s format follows the key in use and there are two
defaults rather than one shared default that would 404 on one path.

**`isAiConfigured()` cannot tell you a key has credit behind it.** A funded-
looking but unfunded key is _configured_: the UI mounts, and the failure
surfaces mid-stream through `onError` rather than as a status code, because by
then the response headers are gone. Checking spendability would mean a network
call on every page render, which is the wrong trade for a billing-details case.

### Streaming is a route handler, and only the stream is

Doc 06 sanctions route handlers "only where the caller isn't our React app".
`useChat` is the caller, and it needs a response body that is still being
written — something a Server Action, which returns one serialisable value,
cannot do. So `POST /api/ai/chat` is a route, and `POST /api/ai/job` is one for
the identical reason (`useObject`, a partial object arriving over 20 seconds).
That is the whole test: a route exists here **only** when a stream is the
product requirement. Both of them read; neither writes.

**There are three routes now, and the test has not moved.** Phase 6's cover letter
is the strongest case for one in the whole feature: the output is prose, and
watching a letter get written is not a progress indicator standing in for the real
thing — it _is_ the thing, arriving in the order a person reads it. That is true of
nothing else here. It can stream, unlike Phase 5, because **its verification runs
against a text haystack the client already holds** (the same `context.json` Phase 4
ships as a keyword haystack, unioned with the posting the user typed), so nothing
new crosses the boundary to make streaming possible.

**Phase 5 has no route, and that is the test being applied rather than
abandoned.** Tailoring takes the same twenty seconds, so "stream it" is the
instinct — but a streamed result is only worth showing if the client can render it
as it arrives, and every row of a tailoring result must be **guarded before it is
shown**. The growth rules compare a proposed value against what the Profile
stores, so the guard needs the profile's content. Phase 4 could stream because
verifying a match needed only an item index (ids and labels), which is safe to
ship to a browser; verifying a rewrite needs the writing itself, and the
serialized profile has no business in a client bundle. So the review is built on
the server, the client has nothing to draw until it exists, and a route handler
would be streaming to nobody. The model call is a Server Action — a command that
happens not to persist. What it costs is one genuinely blocking wait, shown as a
real pending state; what it buys is that no suggestion appears on screen and then
refuses to apply.

**Every mutation stays a Server Action.** Accepting a proposed change, saving a
job application, promoting a delta to the Profile — all of those are ordinary
`createAction` adapters over domain functions. The route streams; it never
writes.

Guards run cheapest-refusal-first, so a flood costs a cookie lookup rather than
an OpenAI request:

```
requireSession → kill switch (503) → configured (501) → rate limit (429)
  → parse + size (400/413) → model
```

### Progress indicators show real states, never theatre

The UI reports states the request is actually in — the SDK's `status`, plus the
workflow's own `data-progress` parts written at genuine transitions. There are no
timers pretending the model is working, and **no model chain-of-thought is exposed
or invented**.

**"Reading your profile…" is now shown, and the reason it was not before is worth
recording, because it is the same reasoning either way.** Phase 2 refused it: the
profile was loaded server-side _before_ the stream existed, so a label claiming it
was happening would have described work that was already over — theatre. The fix
was not to relax the rule but to change the order: the chat route now opens its
stream **first** and does the profile read inside it, writing a crumb at the moment
the read begins and another when the model call is dispatched. The label became
honest because the sequence changed, not because the standard did.

Three properties keep it honest:

- **Every phase is written at a transition, never inferred from elapsed time.**
  `reading` when the database read starts, `thinking` when the model call is
  dispatched (carrying the real count of entries in view), `truncated` when the
  generation stopped against its token ceiling.
- **There is no phase for "writing the answer."** While text is arriving, the text
  _is_ the indicator; a label beside it would be a caption on something already
  visible.
- **The crumbs are `transient`.** They never enter `message.parts`, so they are
  not posted back on the next turn, never reach the model as context, and cannot
  linger beside a finished answer.

**A turn is never allowed to render as nothing.** Unhandled part types fall
through to `null`, so a turn that stopped mid-thought — or produced only reasoning
— used to draw an avatar and empty space, which reads as a crash and offers no
next step. That is now an explicit state with an explanation, and the truncation
notice that usually explains it is a separate crumb, because the two have
different causes and different fixes.

### Context is built, and the starter profile is the trap in it

The Profile goes into the system prompt as **pruned JSON**, built server-side
per request by the pure `buildProfileContext`. Not prose: a prose rendering
("Acme · Senior Engineer") is cheaper but destroys the two things Phase 3 needs
— the **field names** a proposal must address and the **stable item ids** it
must target. A model shown "Acme · Senior Engineer" has to guess the field is
called `company`, and that guess produces proposals the schema rejects.

Three properties of the builder are load-bearing:

- **Starter placeholders are removed.** A new profile is seeded with example
  content — "Example Company", "Your most recent role", `["Add", "your",
"skills"]` (doc 08: empty states teach). That is right for the editor and
  poisonous for a model, which will discuss the user's job at Example Company
  in perfect good faith. This is fabrication arriving through the front door,
  and it is not something a prompt can be trusted to catch. Detection compares
  against a **freshly built `createSeedProfile()`** ignoring ids, so editing the
  seed can never silently break it and there is no second copy of the
  placeholder copy to maintain.
- **Trimming removes whole items, never truncates strings**, and the model is
  _told_ when it happened. A cut-off JSON blob is something a model guesses at
  confidently; a shorter list of complete items is merely shorter. The note
  matters as much as the trim — without it, a trimmed profile is
  indistinguishable from a thin one, and the assistant tells someone with a
  hundred roles that they are light on experience.
- **Absence is meaningful, so it must be reliable.** Empty fields are pruned
  precisely so "none of your projects have links" is a true observation. That
  only holds if nothing _else_ silently removes content, which is why both cases
  above announce themselves.

The profile is re-read per request rather than cached for the conversation: the
user may have edited it in another tab, and answering from a stale copy is a
quiet way to be wrong about someone's own career.

**It is loaded server-side, not as a tool the model calls.** It is needed for
every message in this mode, so a tool call would spend a round trip reaching a
foregone conclusion — and the read is user-scoped by construction, which is what
makes it impossible for a prompt to talk the model into reading someone else's.

### Reasoning tokens are spent from the output budget, and that had teeth

The default model is a reasoning model, and **reasoning tokens count inside
`outputTokens`** — they are spent before a single visible character is emitted.
`maxOutputTokens` set for prose length therefore truncates a turn that has to
_think_, and when that turn was about to call a tool, the result is an assistant
message containing **nothing at all**: `finishReason: "length"`, no text, no tool
call, no error.

That is not a degraded answer, it is a turn indistinguishable from a crash, and it
lands on precisely the requests the feature exists for. "Which parts of my profile
look weakest" answers from the context and streams as it goes; the follow-up — "fix
1, 2, 5 and 7" — has to resolve a numbered reference, map four items onto fields,
and emit complete replacement prose as structured tool input. The chat therefore
has its own ceiling (`MAX_CHAT_OUTPUT_TOKENS`), set above the work the feature asks
for rather than below it, and `reasoningTokens` is logged separately from
`textTokens` because a rise in one means something completely different from a rise
in the other.

Two changes travel with it, because the same request exposed all three:

- **Three steps, not two, and the third is a recovery step rather than a retry
  loop.** The guard legitimately refuses changes — asking to add a technology is
  refused by design — and with a two-step ceiling a turn whose every change was
  refused had no step left in which to say so. The user got an empty answer to a
  request the model had understood correctly.
- **The prompt now resolves numbered references and must name what it skipped.**
  A user answering a numbered list with "fix 1, 2, 5 and 7" means the model's own
  list; asking which they meant is a failure. And when one of the four is
  structurally impossible, saying so in one line is required — going quiet about
  the skipped item is the worst available outcome, because the user believes it was
  handled.

#### It is worse for structured output, and that is what broke job match

The chat got its own ceiling; the two `streamObject` routes did not, and kept the
2,000-token default. **Structured output has no partial credit.** A prose turn
stopped by its ceiling is a short answer somebody can still use; an object
generation stopped by its ceiling is a JSON document that fails validation, so
`useObject` finishes with `object` undefined and every panel conditioned on having
a result renders nothing. `/ai/job` therefore showed "Reading the posting against
your profile…" and then, some seconds later, an empty page — for a call that was
billed in full. Judging fifteen requirements against a whole profile is exactly the
work a reasoning model spends thousands of tokens thinking about before it writes
the first character.

Two fixes, and the second matters as much as the first:

- **`MAX_OBJECT_OUTPUT_TOKENS`** for both object routes, and `MAX_TAILOR_OUTPUT_TOKENS`
  raised to match. The rule generalises: **nothing that runs against a reasoning
  model may use the shared default.**
- **"Finished with nothing" is now a state on screen.** `useObject` sets `error`
  only when the _request_ fails, so a successful request whose object never
  validated flipped `isLoading` to false and said nothing at all — indistinguishable
  from a hang, with no error and nothing to click. Both panels now render a
  sentence with a next step (`TEST_IDS.jobEmpty`, `TEST_IDS.letterEmpty`), and the
  routes log `finishReason` and `reasoningTokens` beside the error, because on
  screen "the model refused" and "the ceiling cut it off" look identical and
  nothing else distinguishes them afterwards.

The same reasoning produced a third fix, in the chat. Reasoning parts are
deliberately not rendered, and the SDK opens the assistant message as soon as the
stream starts — so for the first several seconds of every healthy turn, `status` is
already `streaming` (the composer's "submitted" indicator is gone) and the message
has nothing renderable in it. An avatar beside blank space, for as long as the
thinking takes. `AiMessage` now renders **both** empty cases: still-arriving gets a
working indicator, settled gets the explanation it already had.

#### Raising the ceiling was necessary and not sufficient: reasoning is latency

The ceiling fix stopped `/ai/job` producing _nothing_. It did not stop it looking
broken, and the second report — "analysing forever" — was measured rather than
guessed. Against the real gateway (`openai/gpt-5-mini`), a realistic profile and a
full posting:

|                          | first chunk | total | reasoning tokens |
| ------------------------ | ----------- | ----- | ---------------- |
| default                  | **22.6s**   | 30.0s | 1,600            |
| `reasoningEffort: "low"` | 16.2s       | 31.4s | 832              |

Both produced a valid object with the same requirements. So the route was never
hung: **a reasoning model emits nothing at all until it has finished thinking**,
and structured output has nowhere to hide that. The streaming premise the panel
was designed around — "requirements land one at a time rather than after twenty
seconds of nothing" — was simply false against this class of model. There is no
partial object to watch; there is a blank panel and then everything at once. On a
longer profile the silent stretch grows past `maxDuration`, the function is
killed, and the panel stays blank permanently — the same screen, which is why the
two were never told apart.

Three responses, in order of how much they matter:

- **`structuredProviderOptions()` in `provider.ts`** — `reasoningEffort: "low"`
  for calls whose output is a structure somebody is waiting to look at. This is
  classification and extraction over a document already in the context; the work
  is reading, not deduction, so the deep-thinking budget was buying latency rather
  than accuracy. Deliberately **not** applied to the chat, which is the opposite
  case: it reasons about which of a dozen items an instruction refers to, and its
  output streams, so thinking time is spent behind visible text.
- **`MAX_REQUIREMENTS` lowered from 20 to 12.** Every extra requirement is output
  tokens the user waits through behind a blank panel, and twenty is more than
  anyone reads.
- **The match moved into the chat**, where the wait has an established honest
  shape — the tool's `input-streaming` state, and a transcript that has always
  taken a moment to answer. That was not the reason for the move (see below), but
  it is why the move made the latency legible instead of merely shorter.

The general lesson is the one the ceiling bug taught in a different key: **a
reasoning model's cost is paid before its first visible output**, so every design
that assumes progressive rendering has to be checked against a model that renders
nothing for twenty seconds.

### A stored transcript is a record, never context

Conversation persistence lands in Phase 7 (it was deferred in V1 — see below), and
it arrives with one rule that decides everything else about it: **nothing reads
`ai_chat_sessions` on the way to a provider.** The model's context is still built
per request from the Profile and the turns the client posts. A stored transcript
that fed the next prompt would be a second source of truth about the user's career,
sitting beside the Profile and free to disagree with it — which is the failure this
whole document is written to prevent, arriving through the back door of a
convenience feature.

What follows from treating it as a record:

- **Reasoning parts are dropped before the write.** Not rendering chain-of-thought
  is a display decision; storing it would be a stronger commitment than displaying
  it — the model's private working about somebody's career, in a database, forever,
  read by nothing. It is also where most of the bytes are.
- **The transcript is bounded twice**, by message count and by serialized size,
  because either alone is reachable (many small turns, or one turn carrying a large
  tool result). Over budget, whole messages go from the **oldest** end — the same
  direction `chat-request.ts` trims in, so a reloaded session and a sent request
  agree about which end of a conversation matters. Never by truncating a message:
  half a message is a message that says something its author did not.
- **The part schema is loose on purpose.** A `UIMessage` part is an open union owned
  by the SDK and by whichever tools the app defines this week. A strict schema in
  the domain would make adding a tool to the dashboard a breaking change in a
  package that has no business knowing the tool exists. The **envelope** is checked
  — role, id, every part naming its type — which is all the reader depends on.
- **Titles are derived, never generated.** A dialog asking for a name before the
  conversation exists is a tax on starting one, and spending a model call to name a
  chat is paying a provider to summarise something the user is looking at, for a
  row in a list.
  - **Deriving is not the same as taking the first 72 characters**, which is what
    it meant until 2026-07-29 and which produced a rail of rows that all began
    "hey can you take a look at…" — identical for as far as the eye reads, so
    every one had to be read to its end to be told apart. A derived title has one
    job: **the first few words must be the ones that differ.** So: the first
    sentence rather than the first bufferful, openers stripped, trailing
    punctuation dropped except a question mark, sentence case unless the writer
    plainly chose otherwise.
  - **A fact beats a sentence.** When the conversation analysed a posting, the
    posting names it — "Full Stack Developer at Revival Labs". The domain takes
    that as a `subject` parameter rather than looking for it: reading a
    `tool-analyzeJobMatch` part is the app's business, and `@resfolio/ai` is the
    package that deliberately knows nothing about the app's tools.

**This is where `@resfolio/ai` finally earned its existence** (Future Scalability
below said it had not). Not because the model logic moved — prompts, the provider
seam and every model call stay in the app, where the product decisions are — but
because persistence means a table, and only a domain package may touch one.

### Message parts, not markdown

The chat renders `message.parts`, dispatching on `part.type`. Text renders as
prose; a profile proposal renders as a diff; a job analysis renders as a match
breakdown. Adding a result type is a new `case`, never a rewrite — which is the
only reason Phase 8's generative UI is cheap.

## Tradeoffs

- **Proposals cost a round trip and a click.** A product that wrote changes
  directly would feel faster. It would also, eventually, silently put a lie on
  someone's resume. This is the trade the whole document exists to make.
- **The no-add rule blocks legitimate additions.** A user who genuinely learned
  Go cannot have the AI add it; they type it in the profile editor. Accepted:
  the editor is one click away, and the alternative is a model that can add
  skills, which is the failure mode.
- **The rate limiter is inert without Upstash.** Local dev and CI would
  otherwise need a Redis to run the feature at all. The real spend gate in those
  environments is the absent `OPENAI_API_KEY`; an environment with a key and no
  Redis is a misconfiguration to catch in review.
- **Conversation persistence costs a table and a retention question.** Deferred
  through V1 and delivered in Phase 7 (below) once the cost of _not_ having it —
  every chat lost on refresh, including the one whose proposals were half applied —
  was clearly the larger one. The retention answer is the ordinary one: profile
  cascade, a per-profile ceiling, and a Clear history the user controls.
- **Streaming holds a serverless function open** for the whole answer, against a
  60s ceiling. Multi-step workflows must be a sequence of short model calls
  streamed into one response, not one long call.

## Deferred, with reasons

- ~~**Conversation persistence.**~~ **Shipped in Phase 7.** The deferral's own
  prediction held — it was additive and needed no refactor — but its shape was
  wrong in one way worth recording: it proposed `ai_conversations` + `ai_messages`,
  two tables. One table with a `jsonb` transcript is right, because a transcript is
  only ever read and written **whole**. There is no query that wants one turn, so a
  row per message buys nothing but joins and a second thing to keep ordered.
- **RAG, embeddings, a vector database.** The Profile is already structured and
  small enough to send whole. Retrieval over a document you can fit in the
  context window is infrastructure solving no problem.
- **Multiple providers, agent frameworks, MCP.** One provider behind one seam;
  revisit when a second is genuinely needed.
- **Billing and credits.** The usage seam exists (`onFinish` logs tokens,
  model, mode and user); a meter reads that call site when it is built.
- **Cover letters as `documents` rows.** A document is `Profile × config` with
  no content fields, by that domain's own rule. A cover letter is generated
  prose that exists nowhere in the Profile, so it is a column on the job
  application. (`documents.kind`'s comment currently gestures at cover letters;
  that comment is wrong and is corrected when Phase 7 lands.) Phase 6 therefore
  **persists no letter at all** — it is generated, checked, and copied out of the
  browser, and the UI says as much rather than implying a history that does not
  exist yet.
- **Cover letters as PDFs.** People do attach them. It needs a template, the SDK's
  document contract and the Fly PDF service — real work, and all of it downstream
  of a letter having somewhere to live. Copy-to-clipboard covers the case that
  actually dominates: pasting into an application form or an email body.

## Future Scalability

- **`@resfolio/ai` exists, and holds less than its name suggests** (Phase 7).
  Through Phases 1–6 there was no such package, correctly: Phase 3 extracted
  exactly one file, and it went into `@resfolio/profile` — the `ProfileChange`
  schema, the pure `reviewProfileChanges` guard, and `applyProfileChanges` — because
  that is profile business logic, validated against the profile schema and belonging
  beside the edit helpers. The package was created only when persistence made it
  necessary, and it contains **only** the chat-session domain: the stored-message
  schema, the ceilings, title derivation, and the repository. Prompts, provider
  selection, guards and every model call stay in `apps/dashboard/lib/ai/`, where
  the product decisions are. Naming a package after a technology is how it becomes
  a drawer; what put a table behind an API is what put this one on disk.
- **Job applications** get their own domain package and one table in Phase 7,
  hanging off `profile_id` like every other product table, so account deletion
  stays a cascade.
- **Background workflows** (a long analysis, a batch tailoring run) call the
  same functions from a job runner — jobs are another transport (doc 06).

## Implementation Strategy

| Phase | Delivers                                                                   |
| ----- | -------------------------------------------------------------------------- |
| 1 ✅  | Streaming foundation: provider seam, guarded route, `useChat` surface      |
| 2 ✅  | Read-only Profile awareness — context built server-side, no tools          |
| 3 ✅  | `ProfileChange` schema, diff UI, per-change accept, apply via edit helpers |
| 4 ✅  | Job analysis — pasted JD → requirements / matches / gaps / keywords        |
| 5 ✅  | Job tailoring — AI-authored `ViewDefinition` deltas on a resume document   |
| 6 ✅  | Cover letter generation — cited paragraphs + a verified vocabulary         |
| 7 ◐   | Saved chat sessions ✅ · `job_applications` persistence and history        |

### Phase 1, as built

- `packages/env/src/slices/ai.ts` — `AI_GATEWAY_API_KEY`, `OPENAI_API_KEY`,
  `AI_MODEL`, `AI_ENABLED`, all optional. Rate limiting reuses the existing
  `ratelimit` slice.
- `apps/dashboard/lib/ai/` — `provider.ts` (the vendor seam), `limits.ts` (every
  ceiling in one file), `rate-limit.ts` (Upstash sliding window, per user, per
  mode), `chat-request.ts` (pure, tested: shape + size + oldest-first trim),
  `system-prompt.ts` (voice + the truthfulness invariant, stated once).
- `app/api/ai/chat/route.ts` — the guard ladder, `streamText` with
  `abortSignal`, `maxOutputTokens`, and the `onFinish` usage seam.
- `app/(dashboard)/ai/page.tsx` + `components/ai/` — a Server Component gate
  over one client island; `AiMessage` dispatches on part type.
- `packages/ui` — shadcn's chat set (`Message`, `Bubble`, `Marker`,
  `MessageScroller`); `scroll-fade-b` added to `@resfolio/design`.

### Phase 2, as built

- `lib/ai/profile-context.ts` — the pure builder (prune → drop starter
  placeholders → trim to budget → notes), with `MAX_PROFILE_CONTEXT_CHARS` in
  `limits.ts`. Ten unit tests, all of them cases where the assistant could
  otherwise assert something false about someone's career.
- `system-prompt.ts` — the Phase 1 "you cannot see the profile" paragraph is
  replaced by reading rules **before** the JSON (so they are instructions about
  data the model is about to see, not a correction arriving after it) and the
  context's own notes immediately after it.
- `app/api/ai/chat/route.ts` — `getOrCreateProfile` server-side before
  `streamText`; `profileChars` added to the usage log, because the profile is
  re-sent every turn and is the largest recurring share of input tokens.
- `app/(dashboard)/ai/page.tsx` — runs the **same builder** so the screen and
  the model cannot disagree about whether the profile is empty. Only the
  boolean crosses to the client; the serialized profile is the model's context
  and has no business in a browser bundle. An empty profile is answered on the
  page, with a link to the editor, instead of spending a paid request to
  deliver news the server already had.
- `components/ai/ai-suggestions.tsx` — four starting prompts while the
  transcript is empty. A blank chat box invites "write me a resume", which this
  product refuses, and the refusal reads as breakage.

**Read-only is enforced by the route having no write path**, not by the prompt
saying so. The prompt says it too, because a model that believes it can write
tries to and then reports success — that paragraph aligns its behaviour with
reality rather than creating the guarantee.

### Phase 3, as built

- `domains/profile/src/proposal.ts` — `profileChangeSchema`, the pure
  `reviewProfileChanges` guard, and `applyProfileChanges`. In
  `@resfolio/profile` rather than a `@resfolio/ai` package because none of it is
  model-facing: it validates against the profile's own schemas and writes
  through the profile's own edit helpers, whose comment already reserved the
  seat for "future AI deltas". Nothing in the file imports an SDK, a provider or
  a prompt. 25 unit tests, every one of them a case where accepting the output
  would put something false on a real person's resume.
- `lib/ai/tools.ts` — one tool, `proposeProfileChanges`, built **per request and
  closed over the profile that request loaded**. No profile id crosses the wire
  and no lookup happens inside `execute`, so there is no parameter a prompt could
  talk the model into changing. Its `execute` is pure: it runs the guard and
  returns the partition. `toModelOutput` sends the model two sentences while the
  browser gets the full diff — otherwise the whole diff is re-sent, and re-billed,
  on every later turn.
- `app/api/ai/chat/route.ts` — `tools` passed to `streamText`, to
  `convertToModelMessages` (which is what applies `toModelOutput`) and to
  `toUIMessageStream`; `stopWhen: stepCountIs(2)` — one tool call, then a
  closing sentence. A forged tool result posted by a client buys nothing: a tool
  result only shapes the model's next sentence, and applying re-validates.
- `app/(dashboard)/ai/actions.ts` — `applyProfileChangesAction`, the **only
  write in the feature**. Re-parses the changes with the domain schema, re-runs
  the guard against the current draft, applies through the edit helpers, one
  `saveDraft`, `revalidatePath("/profile")`.
- `components/ai/profile-proposal.tsx` — the review surface. Per-change Apply
  with Apply-all secondary; a quiet before/after rather than a red/green diff
  (nothing is being deleted, and colour is not the only signal); and the count of
  refused suggestions shown, because the guard dropping two changes is the
  feature working and a user who never learns it happened cannot tell this
  product from one that would have written "Kubernetes" into their skills.

**The prompt's Phase 2 "you cannot change this" paragraph was removed, not
amended.** A prompt that describes a capability the code no longer has is worse
than no prompt: the model refuses things it can now do. The paragraph that
replaced it spends its last three lines on the one failure that has a real cost
— reporting a tool call as an accomplished fact when nothing is saved until the
user clicks.

### Phase 4, as built

- `lib/ai/job-analysis.ts` — the pure half: `jobAnalysisSchema`,
  `verifyRequirement` (resolve citations, demote unsupported matches),
  `summarizeMatch` (the arithmetic), `isKeywordPresent` / `coverKeywords`, and
  the request boundary. 21 tests. It stays in the app rather than becoming a
  domain package (model-facing code stays until a second app needs it) and
  borrows exactly one thing from `@resfolio/profile`.
- `domains/profile/src/describe.ts` — the **second** file Phase 3's rule let
  into the domain, and for the same reason: which field names an item is schema
  knowledge, and two surfaces now need it (the proposal review labels the item a
  change touches; the analysis resolves cited ids to names). Custom sections
  contribute their entries, not the heading.
- `app/api/ai/job/route.ts` — `streamObject` behind the same guard ladder,
  rate-limited under its own **`job`** mode. Streaming earns its complexity
  here: an analysis is 15–25s, which is a spinner as one blocking call and a
  list filling in as a stream. The posting goes in as a **delimited user
  message, never spliced into the system prompt** — it is the only whole prompt
  in this product written by a third party. The delimiter is hygiene, not the
  guarantee; the guarantee is that this route has no tools and no write path, so
  a successful injection buys a wrong analysis on the user's own screen.
- `lib/ai/limits.ts` + `rate-limit.ts` — **a mode is now a real budget, not a
  key prefix.** One analysis sends a posting _and_ the whole profile and asks
  for structured output over both; sharing a counter with chat means either an
  annoying chat limit or an expensive analysis limit.
- `app/(dashboard)/ai/job/` + `components/ai/job-analyzer.tsx`,
  `job-match-result.tsx` — the score waits for the stream to finish (a
  percentage that recomputes as rows land is a number that moves while it is
  read), and **gaps are not styled as errors**: red would make the most useful
  line the feature produces read as something going wrong.
- `lib/navigation.ts` — `PALETTE_ITEMS` = the sidebar plus destinations that do
  not earn a row. Job match is one: until Phase 7 gives it a history, a
  permanent sidebar row would open on an empty paste box every time.

### Phase 5, as built

- `domains/profile/src/tailor.ts` — the **third** file Phase 3's rule let into the
  domain, and the one that pays for that rule: it reuses `reviewProfileChanges`
  unchanged rather than owning a second copy of the no-fabrication logic.
  `tailorPlanSchema` (the model's output), `reviewTailorPlan` (guard + resolve the
  ordering against what the resume renders today), `applyTailoredChanges` /
  `applyTailoredEmphasis` (write the `ViewDefinition`), and
  `countTailoredFields` / `clearTailoring`. 24 unit tests; the load-bearing one
  asserts the Profile is unchanged after a delta is written.
  - **Nothing in the model-facing schema is `.optional()`.** Strict structured
    output requires every property to be present, and an empty array says
    "nothing to propose" just as clearly as an absent field. The proposal and
    analysis schemas already followed this; Phase 5 is where it became a rule
    worth writing down.
  - **`orderedSectionKeys` was promoted out of `view.ts`'s private scope.** The
    review has to know whether a proposed section order differs from the current
    one, which is the third surface needing that answer — the dashboard's Sections
    panel carried a copy of it and now calls it.
- `lib/ai/system-prompt.ts` — `CHANGE_LIMITS` extracted from `EDITING_RULES`,
  because **two workflows now emit `ProfileChange`s** validated by the same code.
  Restating five lines in the second prompt would guarantee one copy drifts, and
  the one that drifts is the one nobody rereads. `TAILORING_RULES` adds the one
  thing a model genuinely needs told: **tailoring does not edit the profile**.
  Told only "rewrite this for the posting", a model reasons conservatively about
  someone's permanent record and returns timid, barely-changed prose; told the
  result is an override on one resume, it re-emphasises the way a person writing
  an application does. The permission granted is about scope only, which is why
  `CHANGE_LIMITS` follows it unchanged.
- `app/(dashboard)/ai/job/actions.ts` — three actions, and the model call is one
  of them (above). The guard ladder is the routes' ladder in action form —
  `ActionError` where they use a status code, same order, cheapest refusal first.
  `applyTailoringAction` re-parses the changes and **re-runs the guard against the
  current draft**; `clearTailoringAction` is the way out of a cumulative pass.
  Note which profile the guard reads: the **draft**, because that is what the user
  is looking at. A public resume renders the published version, where a delta for
  an item that does not exist yet is inert — `buildProfileView` resolves deltas
  per item, so an unmatched one is ignored rather than an error.
- `components/ai/change-diff.tsx` — the Phase 3 diff card, extracted so both
  reviews are the same component. Two surfaces reviewing `ProfileChange`s must
  look identical; a second copy would eventually disagree about which side is new.
- `components/ai/resume-tailor.tsx` — the tailoring surface, rendered **inside**
  `JobAnalyzer` because that component owns the pasted posting. Giving the panel
  its own textarea would be the surest way to have the analysis and the tailoring
  disagree about which job the user meant. It appears once there is an analysis to
  read.
- `app/(dashboard)/ai/job/page.tsx` — ships the user's resumes as **three fields
  each** (id, name, public, tailored-field count), not the documents. A resume's
  config, template and view are none of this panel's business, and shipping them
  would put a `ViewDefinition` in a browser bundle to answer a question about a
  name.

- `components/resume/resume-editor.tsx` — `TailoredNotice`, which is where the
  rule "a resume presents a profile, it never contains one" gets honest about
  bending. Without it a user who tailored at `/ai/job` opens their resume editor to
  prose that appears nowhere in their profile, with nothing explaining it and no
  way to undo it. Its Reset needs no action: that editor already owns and autosaves
  `view`, so `clearTailoring` through `setView` persists itself.

**One known lost-update window, accepted.** The resume editor holds `view` in
client state and autosaves the whole object, and documents carry no revision
counter — so a `/resumes/[id]` tab left open from before a tailoring pass will
overwrite the new deltas on its next autosave. This is the pre-existing behaviour
for `config` too, and fixing it properly means a document `rev` and an optimistic
check (what `profiles.draftRev` does). Applying revalidates both resume paths,
which closes it for the ordinary flow; the trade is recorded rather than hidden.

### Phase 6, as built

- `lib/ai/cover-letter.ts` — the pure half: `coverLetterSchema` (no `greeting`, no
  `signoff`, `evidence` before `text`), `findUnsupportedTerms` (the vocabulary
  scanner), `verifyCoverLetter`, and the platform's own `coverLetterGreeting` /
  `coverLetterSignoff` / `assembleCoverLetter`. 27 tests, and the balance of them
  is the point: roughly half are fabrications that must be caught, half are
  legitimate phrasings that must **not** be flagged. It stays in the app (nothing
  here is profile business logic — a cover letter is not profile data) and borrows
  exactly one function from `job-analysis.ts`, `isKeywordPresent`, because "does
  this term appear in the profile" must not have two answers.
- `lib/ai/system-prompt.ts` — `LETTER_RULES`, whose first paragraph is the
  vocabulary rule stated as an instruction, immediately followed by "this is
  checked". Also the one refusal a prompt has to carry alone: **no
  years-of-experience total.** It is arithmetic over real dates, so a model
  produces it in good faith; it is also the most common way a letter overstates.
  The scanner flags it; the prompt is what stops it being written.
- `app/api/ai/cover-letter/route.ts` — `streamObject` behind the same guard ladder
  under its own **`letter`** mode, which is the tightest of the four budgets (4 per
  10 min): a letter is the one output people reroll rather than accept, and
  "reroll until it's perfect" is worse for them than "edit it yourself". It reuses
  `parseJobRequest` unchanged, because the request body is identical to the job
  route's — `{ jobDescription }`. **The recipient is not in it.** The greeting is
  composed in the browser, so the name a user types never reaches the server, the
  provider, or a log.
- `components/ai/cover-letter.tsx` — the draft, its citations, and the checks under
  it. Copy is the primary action and `.txt` the secondary one, because this text is
  pasted into an application form or an email body, where every character of markup
  would have to be deleted by hand. **The flag list waits for the stream to
  finish** — mid-stream, a half-written word is an unrecognised term — and a
  partial _paragraph_ is still shown as it arrives, because prose has no verdict
  that can flip.
- `components/ai/job-analyzer.tsx` — the letter renders here, like the tailoring
  panel, because this component owns the pasted posting. `/ai/job` is now a
  sequence: read the posting, fit the resume, write the letter. That is the shape
  of applying for a job, and the reason none of the three earned a route of its
  own.

**Phase 6 persists nothing, and the UI says so** ("nothing here is saved — copy it
before you leave the page"). That is not a gap being papered over: a cover letter's
home is a column on the job application, by the document domain's own rule that a
document carries no content fields, and `job_applications` is Phase 7. A draft that
looked saved and wasn't would be worse than one that admits it.

### Phase 7, as built (chat sessions half)

Phase 7 has two halves. This is the first: **saved conversations**.
`job_applications` — where a job analysis, a tailoring pass and a cover letter get
somewhere to live — is still to come, and is unaffected by anything below.

- `packages/database/src/schema/ai.ts` — `ai_chat_sessions`, migration **0014**.
  Profile-owned with a cascade, like every other content table, so account deletion
  stays one delete. One index, composite on `(profile_id, updated_at desc)`: the
  rail's only query is this profile's sessions newest-first, and the sort is never
  done without the filter. `message_count` is denormalised for the same reason
  `blog_posts` stores `reading_minutes`.
- `@resfolio/ai` (`domains/ai`) — pure root (`sanitizeMessages`,
  `deriveSessionTitle`, `isWorthSaving`, the stored-message schema, the ceilings; 18
  tests) and `./server`, the only code that touches the table. Every function takes
  `userId` and resolves the profile itself, which is what makes a session id safe in
  a URL — a stranger's resolves to nothing. Two details in the repository worth not
  undoing: the upsert carries **`setWhere` scoped to the owner** (the conflict target
  is the primary key, so without it a request naming someone else's id would update
  their row), and `listChatSessions` names its columns so `messages` is not among
  them — listing fifty conversations must not load fifty transcripts.
- `app/(dashboard)/ai/page.tsx` — `/ai?c=<id>`, a **search parameter rather than a
  route segment**. `/ai/job` already occupies that position; a dynamic sibling makes
  "job" an id nobody may be assigned and leaves the route table depending on a
  static-beats-dynamic precedence rule. **The page reports the conversation the URL
  names, or `null`, and invents nothing** (corrected 2026-07-29). It used to mint
  the new-chat id here — `saved?.id ?? randomUUID()` — with the workspace keyed on
  it, which made the page non-idempotent: two renders of one URL produced two ids,
  so any re-render of the route while a chat had no `?c=` yet remounted the whole
  workspace and dropped the user into a blank new chat mid-answer. Re-renders are
  ordinary events — `router.refresh()`, and any Server Action calling
  `revalidatePath`, since Next re-renders the current tree in the action's
  response. The id now lives in the client, which is also the only place that can
  hold it: **the URL is claimed during the conversation**, so the server's answer
  for one unbroken chat changes from "nothing" to an id without a navigation, and
  anything keyed on that remounts at exactly that moment. See
  `lib/ai/chat-identity.ts` for the four cases.
- `app/(dashboard)/ai/actions.ts` — save, delete, clear. **Persistence did not earn
  a fourth route handler and could not have**: the rule is that a route exists only
  where a stream is the product requirement, and this is a write of a finished
  thing. Saving is called once per **settled turn**, never per token, and the client
  serialises its saves through a promise chain — two turns settling close together
  on one row is a lost update that no revision column is worth preventing here.
- `components/ai/ai-workspace.tsx` + `chat-history.tsx` — the rail beside the
  conversation. **The list lives in client state, seeded from the server**, because
  the alternative is `router.refresh()` after every save: re-rendering the route
  mid-conversation, and remounting the transcript being read, to add a row whose
  contents are already on screen. Rows are **links**, so a conversation can be
  bookmarked and reached with the back button; `AiChat` is keyed on the session id,
  because `useChat` reads its initial messages once and two conversations are two
  components. After the first save the URL is updated with
  **`history.replaceState`, not `router.replace`** — the router would re-render the
  route and remount the transcript to change an address bar. **The workspace adopts
  a new conversation only when the URL itself changes**, compared against the URL
  as it last saw it and never against the id on screen: the two differ for a
  perfectly ordinary reason, which is that an unsaved chat has an id in the client
  and nothing in the address bar. Whoever changes the URL updates that record —
  `startNewChat` replaces the URL *and* clears it, or the next re-render reads its
  own edit as a navigation.
- **Delete asks nothing; Clear history asks.** Deleting the row under the pointer
  destroys one conversation the user can see, and a modal in front of that is a tax
  on tidying up. Clearing reaches everything scrolled out of view, which is what a
  confirmation is for.

### Phase 7, as built (job half)

`/ai/job` is retired — see "Is job matching a chat mode at all?" under Resolved
for why the Phase 4 answer was reversed. What replaced it:

- **`analyzeJobMatch`, the chat's second tool.** Paste a posting and the model
  calls it; the card renders where the answer would have been. Its **input is the
  analysis** (role, company, location, the posting's URL, requirements,
  keywords) — so it streams as tool input and needs no second model call — and
  its `execute` is **pure**, exactly like `proposeProfileChanges`: resolve
  citations, demote unsupported matches, count, return. **The posting is not an
  input.** It is already in the conversation, so `execute` closes over it
  (`findJobDescription` walks back to the most recent message long enough to be a
  posting, which is what makes "recalculate" work as a turn of its own). Echoing
  it back as arguments would bill the same 4,000 characters twice and delay the
  first requirement by seconds.
- **The tool writes nothing.** `saveJobMatchAction` does, fired once by the card
  on a `useRef`-guarded effect — the same shape as the transcript's save, and for
  the same reason: an AI tool with a write path is what this architecture exists
  not to have, and "it only writes a job row" is how that erodes. The job id is
  minted server-side inside the tool result and lives in the transcript, so
  reopening a conversation re-saves the same job rather than creating a second.

**`@resfolio/job` is a new domain, and not part of `@resfolio/ai`.** A row is one
job the user is working on — the posting, the score, what they changed for it, the
resume and the letter. Matching is how it gets created; it is not what it is. The
`status` column (`saved | applied | interviewing | offer | rejected | ghosted`) is
written from the first save, which was done **before** the tracker existed because
a status column added later has to be backfilled with a guess about rows that
predate the concept. `@resfolio/ai` stays what its own CLAUDE.md says it is: saved
chat sessions.

### The Application Tracker (2026-07-28)

`/jobs` is the surface those states were written for. Two views over one list:
a **board** (a column per state, drag to move) and a **flow** (a Sankey of the
whole search). Every posting analysed in a conversation is already a card, in
Saved.

- **The tracker is a UI over data that was already there** — no backfill, and the
  only migration (`0016`) adds one column for something genuinely new.
- **A snapshot cannot draw a funnel, so transitions are recorded.**
  `status_history` is a capped jsonb array appended by `setJobStatus`, the same
  shape `profile_changes` uses. A row sitting in `rejected` might have been turned
  down after three interviews or filtered out the day it was sent, and the
  `status` column cannot tell those apart — a flow derived from it has to invent
  its own middle, drawing every offer as having interviewed and never able to draw
  "declined after interview" at all. Two rules ride with it: **history is seeded on
  insert only** (like `initial_score`, and for the same reason — it is a baseline),
  and **a move to the status a job already holds records nothing**, because
  dropping a card back where it came from is not an event and counting it would
  put a self-loop in the funnel.
- **Rows predating the column get a synthesised single event on read**, not a
  backfill migration. The only honest thing that can be said about such a row is
  where it is now and when it was created; writing invented transition timestamps
  into the table would put fiction somewhere it outlives the migration that wrote
  it, and every later read would trust it.
- **`saved` is not in the flow.** A posting read and never applied to is a
  bookmark, and counting bookmarks in a funnel makes every rate below it look
  worse than it is. The board is where saved jobs live.
- **`ghosted` is not a variety of `rejected`.** An application nobody answered
  says something about the employer; a job search where half the applications
  vanish is a different problem from one where half are turned down, and reading
  them as one number hides the more actionable of the two.
- **The flow is computed in the browser**, from `buildJobFlow` in the package's
  pure root, against the same list the board renders. A diagram that could only be
  rebuilt by the server would contradict the column the user just dropped into
  until the next navigation — and two views fetching their own copies is how a
  product ends up showing eight interviews beside a column holding seven cards.
- **Sharing is an export, not a link.** The diagram is drawn from a list that
  names every company that turned the user down. PNG / SVG / copy ships; a public
  URL is a decision with its own privacy posture, revocation UI and noindex rules,
  and bolting one onto a chart component is how those get skipped.
- **The prompt that fills it in sits where the application happens.** Clicking
  through to a posting is the moment somebody would file it — not later, on
  another page — so `ApplyPrompt` asks once per job, and only while the job is
  still `saved`.
  **The click opens the question and the answer opens the posting**
  (reversed 2026-07-29). It shipped the other way round, letting the navigation
  through and leaving the dialog waiting in the tab behind, on the principle that
  blocking a link teaches people not to press links. But the tab it waits in is
  the tab the user has just left: the question is asked of a screen nobody is
  looking at, and answering it costs a context switch back plus the work of
  reconstructing what was being asked. Asking first costs one click on the way
  out — the cheaper of the two, and the only one people actually pay. Nothing is
  lost but the order; the posting still opens in its own tab, opened by the
  answer. A modifier or middle click is left alone, because that is the user
  talking to the browser rather than to this product.
  **It asks how to file the job, not whether you applied**: a yes/no question
  makes "no" mean nothing, when the honest answers are "I'm keeping this" and
  "I've sent it". So the two answers are the two columns — **Saved** and
  **Applied** — and both write, which is what stops the board needing a drag
  afterwards. Choosing Saved records the status the row already holds, which the
  domain treats as a no-op rather than a transition, so the flow view is never
  handed a hop that did not happen.

**One conversation covers one job, and this is a rule rather than advice.** A
chat has one artefact panel, one resume slot and one score; a second posting in it
does not degrade the experience, it produces a conversation that is lying about
which job it describes. It is also paid for twice over, since every turn re-reads
the whole transcript — and `findJobDescription` walks back to the most recent long
message, so after a second posting lands, asking to re-check the first one
silently re-checks the second.

It is enforced **twice, in two different places, for two different reasons**:

- **The composer refuses to send.** A pure predicate over the transcript's own
  tool results and the pending text (`lib/ai/second-posting.ts`) — no request, no
  model call, since a detector that spent one would be a smaller copy of the
  problem. There is no "send anyway": the server would refuse it, so the button
  could only ever have meant "spend a call to be told no". What is offered
  instead is a new chat **carrying the pasted text**, in memory rather than
  through the URL, because a twelve-thousand-character query string is not a link.
- **The tool refuses to run.** A guard that exists only in the browser is one a
  sentence can talk the model around — "analyse this other one too" is ordinary
  English. `analyzeJobMatch` is told what the conversation already analysed
  (read from the same transcript, so it cannot disagree with what the user sees)
  and returns `unavailable: "already-analysed"`, which the transcript renders with
  a Start-a-new-chat button.

**A re-check of the same posting is not a second job**, and the distinction is
made by comparing the posting rather than by counting calls — `isSamePosting` is
shared by both guards precisely so they cannot draw the line differently. "Recalculate
the match" leaves the original paste as the most recent long message, so it
resolves to the same text, and that path now **reuses the existing job's id**.
That is not a detail: before it, every re-check minted a fresh row with its own
`initial_score`, so the "74% → 86%" comparison the feature is built around could
never actually be drawn.

The bar for the composer's half is the false positive. Ordinary work — "enhance my
summary", "what am I missing?", a re-paste of the same posting with the benefits
trimmed, the description that follows a link — must all pass silently, or the
block becomes something users route around without reading.

**Optimising happens once per posting, and then the card is finished.** It used to
retire one destination at a time, which is defensible and was still read as the
product having forgotten: a reopened conversation showed a live button next to
work the user had already accepted. So any accepted optimisation closes the whole
card — both destinations disabled and labelled with what happened, no submit. The
cost is named rather than hidden: a resume can no longer be tailored for a job
after the profile has been enhanced for it *from that card*. `/resumes/[id]` still
owns everything about a document.

**What stays live after the lock is the step that spends nothing.** `SkillGaps`
is the user ticking boxes beside evidence from their own writing, re-derived
server-side — a step of the job session rather than an optimisation. Locking it
would leave terms the posting names unlisted for the sake of a rule about model
calls. Once the card is finished it falls back to the **profile** destination,
which is also the right answer on its own terms: a term you have demonstrably used
is a fact about your career, not an opinion held by one document.

**Enhancement is a reason to propose changes, never a permission to make them.**
"Enhance my profile for this job" runs `generateObject` against
`profileProposalSchema` and returns a `ProfileChangeReview` through
`reviewProfileChanges` — the same guard, the same per-change consent, the same
`ProfileProposal` component, with only the write injected so the job row learns
what the posting caused. Nothing about the write path is different because a job
asked for it. Two details:

- **The `<70%` warning is a confirmation, not a gate**, and no server code
  consults the score. Below the threshold the honest reading is that this is not
  really the user's job, and rewriting a career record to chase a role it does
  not fit should be a decision rather than a click; above it a dialog would be a
  click charged for nothing. The constraint is the guard, which is identical
  either way.
- **The re-check is asked for, never automatic.** A new score is a fresh model
  judgement — it costs a call — so accepting changes ends with a prompt to ask
  the chat, which produces a new card. `initial_score` is written on insert only;
  a re-match writes `enhanced_score`, which is what makes "74% → 86%" a
  measurement rather than two numbers.

**The artefact panel reads the database, not the transcript**, which is the
distinction that earns it. The card renders one tool result; the panel renders the
_job_, which outlives the message that created it and accumulates a resume and a
letter afterwards. The resume is a **reference with `on delete set null`**, never
a copy: a job pointing at a snapshot would offer a version of the resume that
exists nowhere else. Phase 5's tailoring moved into this panel beside the resume
it edits — and then moved out again on 2026-07-28, because a second trigger in a
second place is what made two destinations read as two duplicate features (see
"Two destinations became one question" above). What the panel keeps is the
_state_ of the document: how many fields a resume overrides and the way back,
which is true whether or not a job is on screen.

**Cover letters get a real PDF, drawn by `pdf-lib` rather than by Chromium.** This
is a different decision from the resume's and the difference is the artefact: a
resume is a _template_ — arbitrary CSS, per template — so it needs a rendering
engine, which is why `apps/sites` hands export to a headless Chromium on Fly. A
letter is one fixed layout that has not changed since the typewriter. Drawing it
directly means no second service on the request path, no `RENDER_SECRET` hop, a
file in milliseconds, and letters that keep working where `PDF_EXPORT_ENABLED` is
off. Three things fall out:

- **The fonts are vendored** (PT Serif, OFL, beside the code). `@pdf-lib/fontkit`
  embeds a real typeface instead of one of the fourteen PDF base fonts. PT Serif
  specifically because it ships **static** Regular/Bold/Italic — pdf-lib embeds
  the default instance of a variable font with no way to select a weight, so a
  variable family gives you a bold that silently is not bold.
- **Layout is split from drawing** (`cover-letter-layout.ts`, pure and tested).
  Pagination, wrapping and the single-word-longer-than-the-measure case are
  arithmetic, and the failure they prevent is a plausible-looking PDF with a
  sentence drawn below the bottom edge, in a file somebody sends to an employer.
- **`sanitize` exists because pdf-lib throws on an unencodable character** rather
  than dropping it, so one smart quote in a model-written sentence would fail the
  whole download.

### The chat is a bounded layout, which required fixing the shell

The chat is the app's first surface that has to **fill** its pane rather than grow
past it: a messages region that scrolls on its own, with a composer anchored below
it. That is three flex rows and one `min-h-0`, and none of it could work, because
the shell above it never established a height. `SidebarInset` had no bound, the
content region was a plain `flex-1` block, and `RouteTransition` — which sits
between the shell and every page — carried no layout classes at all and returned
its children bare under `prefers-reduced-motion`. Every `flex-1` and `h-full` below
that resolved against `auto`.

So the symptoms all had one cause: the message list sized the column, the column
grew past the viewport, `<body>` gained a scrollbar, and the composer was pushed off
the bottom of the screen. "The input moves down when I type", "scrolling the chat
scrolls the page" and "there are two scrollbars" are one bug reported three ways,
and no amount of CSS inside the chat could have fixed it.

The shell now: `h-dvh overflow-hidden` on the inset, and a content region that is
`grid` with **`grid-rows-[minmax(0,1fr)]`** — the primitive that hands its child a
_definite_ height (so `flex-1` inside means something) while letting a taller page
overflow and scroll, which is what every ordinary route still does. Consequences
worth knowing:

- **The document no longer scrolls; the content region does.** The top bar is
  genuinely fixed rather than sticky, and its `sticky top-0` was removed because
  dead CSS describing a layout the app does not have is worse than none.
- **`dvh` is safe here precisely because of that.** Browsers collapse their chrome
  in response to _document_ scroll, so with the document static, `dvh` sits still —
  and unlike `svh` it follows the mobile keyboard, which with
  `interactiveWidget: "resizes-content"` is what keeps the composer above it.
- **`RouteTransition` always renders a flex column, on both branches.** The
  reduced-motion path returning children bare meant the layout chain differed by an
  OS setting — a class of bug that only ever gets reported as "it looks broken on
  my machine".
- **The composer is a grid row, not sticky positioning**, so it cannot come
  unstuck. It grows upward as its textarea does (`useAutosize`, because
  `field-sizing: content` has no Safari support yet) and its bottom edge never
  moves.

`e2e/shell.spec.ts` guards the invariant on `/profile` rather than `/ai` — the chat
only renders with a provider configured, and this belongs to the shell, so it has
to be provable on a route that always exists.

## Open Questions

- **Whether `gaps` should be persistable.** A gap is useful across applications
  ("three JDs wanted Kubernetes"), which argues for storing it — but that is a
  career-insight feature, not part of tailoring. Revisit after Phase 7.
- **Whether `custom` sections should be proposable.** They are excluded today
  for a structural reason rather than a policy one: a custom item is nested
  inside a custom _section_, so addressing one needs a coordinate
  `ProfileChange` does not carry. Adding it is a schema change, which is the
  right amount of friction for widening what a model may touch — but a user who
  keeps their publications in a custom section will notice the asymmetry.

### Resolved

- **Is job matching a chat mode at all?** Answered "no" in Phase 4 and
  **reversed in Phase 7.** `/ai/job` is retired; the match is a tool call inside
  the conversation.

  The Phase 4 reasoning was sound about the _analysis_ and wrong about the
  _workflow_. One input and one result really is a poor fit for turn-taking — but
  the analysis was never the workflow. What people do is read a match, decide
  their profile undersells them, change it, look again, tailor a resume and write
  a letter, and every one of those steps is a turn. The route ended up modelling
  that as three panels stacked under a textarea, with the second and third
  appearing once the first had a result: a conversation, rendered as a form,
  without any of a conversation's affordances. And it started by asking someone
  who had just been discussing their career with an assistant to go to another
  screen and paste the posting into a second box.

  Two things that were true then are still true and are now solved differently:
  - **A structured result must not scroll away.** It does not — it is in the
    transcript where the answer was, _and_ the job's artefacts (posting, resume,
    letter) are pinned in a panel beside the conversation that reads from the
    database rather than from the messages.
  - **The score must not move while it is read.** It cannot: the tool's output is
    computed whole, after verification, in one `execute`. The old route held the
    score back until streaming finished; there is nothing to hold back now.

  What made the reversal cheap is that nothing about the _analysis_ changed.
  `job-analysis.ts` still classifies, verifies, demotes and counts; it moved from
  behind a `streamObject` route to behind a tool's pure `execute`, which also
  removed a route handler rather than adding one. The posting is closed over from
  the conversation rather than re-emitted as tool arguments — the same principle
  as the profile, and worth ~4,000 tokens a call.

- **Where the per-change accept lands when a proposal touches `basics` and items
  in one response** (Phase 3). Accept-one and Apply-all are the **same action
  with a different array**: it takes `changes[]`, so a batch is one revision and
  one round trip rather than six of each, and per-change consent is unaffected —
  the batching is in the transport, not in the approval.
  The action takes **no `draftRev` from the client**. The profile editor sends
  one because it holds a form the user has been typing into; `/ai` holds no
  draft at all. Reading the current revision and writing it back inside one
  request narrows the lost-update window to milliseconds, and a concurrent
  editor's autosave then fails its own optimistic check and rebases — the
  existing concurrency working in the right direction rather than a second
  mechanism beside it.
