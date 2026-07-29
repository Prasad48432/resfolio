# Resfolio — Future Plan

A product & architecture review to take Resfolio from a good portfolio builder
to a career OS professionals rely on for years. Written as a senior-staff-level
review: opinionated, ranked by impact, and willing to say "don't build this."

**Core thesis that makes everything below work:** Resfolio already made the
hard, correct call — _the Profile is structured truth and every output (resume,
portfolio, PDF, cover letter) is a projection of it, never a copy._ Resume
builders store PDFs and forms and therefore can never become a career OS. We
store career _data_. Protect that principle; it is the moat.

---

## Part 1 — Architecture & Production Readiness

**Reframe:** We do not have a scaling problem, we have a "not launched yet"
problem. Every known bottleneck is real but none hurt at 0–10k users. Rank by
"breaks at launch," not by "sounds impressive." Fix the cheap high-leverage
things; resist rebuilding infrastructure we won't stress.

### P0 — before public launch

1. **Ship `R2ExportStore` (PDF cache is a no-op in prod).** `LocalFsExportStore`
   writes to an ephemeral serverless FS → ~0% hit rate → every download boots
   Chromium. `@resfolio/storage` + R2 already exist; the interface exists. This
   is a swap, not a rewrite. Cache key = `(documentId, publishedVersionId,
config-hash)` so a config edit invalidates cleanly.
2. **PgBouncer / transaction-mode connection pooling — mandatory.** Serverless
   functions exhaust Postgres _connections_ (100–500) long before CPU. Without
   pooling a traffic spike returns `too many connections` and 500s the app. Do
   this before read replicas. Config change, not code (Supabase/Neon give it
   free).
3. **Move PDF generation off the request path.** `maxDuration: 60` + synchronous
   Chromium boot = concurrent exports wedge, cold boots eat the budget.
   Interim: a **warm browser pool** (always-on service holding 1–2 Chromium
   instances). Later: the documented Trigger.dev async job (returns `jobId`,
   notifies on completion) once volume justifies the UX complexity.
4. **Database indexing — invisible until it isn't.** Add indexes before there's
   data: `handle` (public render hot path), every owner-scoped list query
   (`listDocuments`, `listConnections`, `listPendingItems`,
   `listImportReceipts`, `blog_posts` by profile), and
   `profile_versions(profileId, createdAt DESC)`. One migration.
5. **Apply the 10 unapplied migrations (0003–0012) on a staging DB and
   smoke-test** before they touch production.

### P1 — first 3–6 months

6. **Full-document JSONB autosave writes** — debounce harder + a cheap
   dirty-check (only write when the serialized draft actually changed) _before_
   reaching for `jsonb_set`. Partial updates would sacrifice the
   "validate the whole document with the domain schema before write" invariant,
   which the architecture leans on. Don't trade that away lightly.
7. **Unbounded `profile_versions`** — versions grow on **publish**, not
   autosave, so only the daily-publisher is pathological. Retention policy: keep
   last N (~30) + one per month beyond. Deltas/cold-storage is over-engineering
   for KB-sized JSON — don't build it yet.
8. **Read replicas — defer hard.** ISR already absorbs most read load at the CDN
   before Postgres sees it. A replica adds replica-lag bugs (publish → stale
   read) for throughput we don't need. Get PgBouncer + indexing + ISR right,
   measure, _then_ add a replica only if reads saturate the primary.

### Explicitly do NOT do

- **Microservices.** We already have the good version of service boundaries: a
  **modular monolith** of clean domain packages (`profile`, `document`,
  `portfolio`, `blog`, `integrations`) with enforced public APIs and
  single-writer table ownership. Splitting into deployed services buys
  distributed-transaction pain and 5x ops surface to solve a problem we don't
  have. The _one_ correct service split already exists: `apps/sites` as the
  sessionless render host. Keep it; resist all others. The only future
  candidate is PDF rendering → the Trigger.dev worker (a job, not a service).

### The rest of the checklist

- **CDN:** ISR for `/p/[username]` (good). Make `/render/resume/[id]`
  CDN-cacheable keyed on published version. **R2 image delivery must sit behind
  a CDN** (Cloudflare in front of R2) — never serve the bucket origin directly.
- **Caching (3 layers, be deliberate):** CDN/ISR for public pages, R2 export
  cache for PDFs, Better Auth cookie cache for sessions. Missing piece =
  invalidation discipline (publish → revalidate, log failures).
- **Image optimization:** upload-time re-encode + EXIF strip already done
  (security win). For delivery, generate 2–3 responsive sizes at upload and
  serve by breakpoint — portfolios (avatar + projects + banner) are the
  bandwidth cost.
- **Horizontal vs vertical:** app tier is already horizontal + stateless (the
  ephemeral-FS PDF cache was the one accidental stateful assumption). The
  ceiling is the single Postgres — PgBouncer + indexing raises it far cheaper
  than sharding.
- **Production infra checklist:** Sentry (have it), Pino logs (have it),
  **uptime/health checks on the render host** (SPOF for PDFs + public sites),
  **backups verified by an actual restore test**, and a **staging env that runs
  the migrations first**.

**Priority order:** R2 export store → PgBouncer → DB indexes → warm browser pool
→ apply migrations on staging → then revisit with real metrics.

---

## Part 2 — Product Strategy (retention)

**Diagnosis:** portfolio builders are "build once, leave forever" _structurally_
— a finished artifact has no reason to be reopened (Teal and Polywork both hit
this wall). The real question: **what makes the profile a living thing that
decays if ignored?**

Three mechanics, by leverage:

1. **Make the profile go stale — and show it.** Biggest lever, nearly free given
   our import connectors. Turn imports from one-time pulls into a **passive
   freshness signal**: "3 new repos since you updated," "your top SO answer got
   40 upvotes," "nothing added since March." A **weekly digest** email/notif is
   the retention engine — not "come back," but "here's what changed about _you_
   that you should capture."
2. **Analytics on public surfaces.** "Who viewed / downloaded your resume"
   (country, referrer, which resume) is a daily-check loop (LinkedIn built an
   empire on it). We own the sessionless render host — add lightweight,
   privacy-respecting view analytics.
3. **Career events, not artifacts.** Log the _input_ (shipped a project, got
   promoted, gave a talk) and the resume/portfolio regenerate as a _byproduct_.
   This inverts the category: competitors ask you to maintain a document; we ask
   you to journal your career and the documents fall out. This is also the
   substrate the AI features feed on.

**Skeptical of:** gamification/streaks (cheapens a professional-identity brand),
and standalone "AI suggestions" (nobody opens an app _to_ get suggestions —
suggestions must ride the freshness/event loop).

---

## Part 3 — AI Cover Letter Generator (critical eval)

Good flagship candidate (job-application tooling = where willingness-to-pay
lives). Two problems with the workflow as proposed:

- **Collision:** "generate a tailored resume for this job" breaks the
  _one-profile, one-resume-per-template_ rule (load-bearing for the whole
  editor). **Fix:** model a **"Job Application" as a first-class entity**
  referencing (a) the profile version, (b) a _tailoring overlay_ (which
  experiences to emphasize/reorder — an extension of the existing
  `ViewDefinition`), and (c) the cover letter. The tailored resume is
  `Profile × JD-overlay`, rendered through the existing pipeline. This fits
  "one profile, many outputs, never a copy" _perfectly_ — a projection, not a
  fork.
- **Misframing:** the cover letter is commodity; the **profile gap analysis** is
  the real feature ("job wants Kubernetes; you show Docker not K8s — real gap or
  missing entry?"). It's honest, grounded in the user's real structured data
  (which nobody else has), and it drives the user _back into the editor_
  (retention). Lead with gap analysis; treat the cover letter as the reward.

**Build notes:**

- Ship **paste-first**; JD-from-URL is hard (JS-rendered ATS: Greenhouse, Lever,
  Workday all differ). Add URL fetch for the top few ATS as a fast-follow — do
  not let it gate the feature.
- Keep "explain why experiences were emphasized" — transparency is a
  differentiator vs black-box generators.
- **Extract with structure, generate with restraint:** JD → typed
  skills/requirements (deterministic), LLM writes only prose, not judgments.
- Saved Job Applications = the wedge into a **job-search command center**
  (Part 4).

---

## Part 4 — Feature Brainstorm (weekly/daily return)

Exploit the moat: _structured career data + multi-output rendering + import
connectors._

**Build these (highest leverage):**

1. **Job Application Tracker** — Kanban (saved → applied → interviewing → offer),
   each card carrying its tailored resume + cover letter + JD + notes. Teal
   proved people pay for this; we already own the resume half. Most defensible
   next feature.
2. **Career Changelog / Brag Document** — running accomplishment log (auto-fed by
   connectors + manual). Doubles as the perf-review artifact engineers need
   annually _and_ the freshest input to resumes/cover letters. Weekly prompt:
   "what did you ship?"
3. **Public-surface analytics** — views/downloads/referrers/geography. Daily-check
   loop, zero AI.
4. **Resume "diff for this job"** — exact delta between current resume and what a
   saved job wants, as an actionable checklist.

**Strong second tier:** 5. **GitHub-native "Proof of Work"** — go past the activity graph: surface merged
PRs to popular repos, first-time contributions, language breakdown as
verifiable portfolio items. The developer/OSS differentiator. 6. **Interview prep from your own profile** — questions an interviewer will ask
about _your actual project descriptions_; loops back into strengthening weak
entries. 7. **Shareable career one-pager / link-in-bio** — the Bento/Read.cv niche, cheap
given the rendering pipeline, high sharing/virality.

**Speculative but on-brand:** 8. **Recruiter-facing search/directory** — once N structured, verifiable, public
profiles exist, recruiters searching them is the second side of a network.
Only possible because our data is structured, not PDF blobs. (See Part 6.)

**Avoid:** generic "AI career coach" chatbot (undifferentiated, low trust), and
anything generating content the user can't verify (inflated bullets → rejections
→ burned brand).

**The roadmap filter:** every feature must (a) enrich the structured profile,
(b) render a new output from it, or (c) create a return-loop around it. If it
does none of the three, it doesn't belong — no matter how good the AI demo.

---

## Part 5 — Competitive Analysis

| Player                               | Does well                                              | Opening for us                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **LinkedIn**                         | Network, recruiter graph, distribution                 | Ugly, generic, you don't own it, terrible at showing _actual work_; no beautiful output                                                       |
| **Resume.io / Novoresume / Enhancv** | Polished resume PDFs, ATS, templates                   | **Resume-only.** No portfolio, no living profile, no imports, no code. One-and-done by design                                                 |
| **Reactive Resume**                  | Free, OSS, privacy                                     | Hobbyist UX, resume-only, no career loop, no AI depth                                                                                         |
| **Teal**                             | Job tracker + resume tailoring (closest to our vision) | **Most direct competitor.** Weak on portfolio/personal-site + developer/OSS proof; busy UI. Out-execute on developer + beautiful-output angle |
| **Read.cv**                          | Beautiful, minimal, dev-loved                          | Effectively dying/absorbed — **a vacuum right now** in exactly our aesthetic + audience. Move in                                              |
| **Polywork**                         | "Living" career log                                    | Died — great idea, no retention engine, no output artifact. Lesson: the living log must _produce_ something                                   |
| **Bento / Contra**                   | Link-in-bio, freelancer profiles                       | Shallow professional depth, no resume/PDF, no structured data                                                                                 |
| **GitHub**                           | Ground truth for code                                  | Not an identity surface; be the layer that turns activity into narrative                                                                      |
| **Medium / Hashnode**                | Publishing                                             | Not identity-centric; our blog domain keeps writing _inside_ the identity                                                                     |
| **Framer sites**                     | Total design freedom                                   | High effort, no data model, no resume, no career loop                                                                                         |

**The unaddressed opportunity (the whole thesis):** every competitor is
_distribution without ownership_ (LinkedIn), _a document without a life_ (resume
builders), _a life without a document_ (Polywork), or _beauty without structure_
(Framer/Bento). **Nobody owns the intersection: one structured, living,
verifiable career record that renders into every output and stays alive because
it imports from where work actually happens.** Read.cv's disappearance makes the
timing unusually good.

**Positioning sentence no competitor can honestly say:** _"Own your career data
once; it becomes your resume, your site, your PDF, your cover letters, your brag
doc — and it stays current because it watches your GitHub, your writing, your
work."_

---

## Part 6 — Long-Term Vision (3 years)

The words are already right ("Career OS, not a resume builder"); the challenge is
staying disciplined.

- **Year 1 — The living profile that renders everything.** Nail: profile as
  source of truth, multi-output (resume/portfolio/PDF/one-pager), imports as a
  freshness engine, the Job Application feature. Win the "Read.cv successor +
  Teal for developers" position. Retention = freshness + analytics + job
  tracking.
- **Year 2 — The career operating system.** The hub for the whole job-search and
  career-management loop: applications, cover letters, interview prep, brag docs,
  perf-review exports, offer tracking. Weekly touch. Monetization matures
  (individual Pro + a tailoring/tracking tier).
- **Year 3 — The two-sided flip.** With enough structured, verifiable, public
  profiles, value inverts: **recruiters and hiring teams** search our directory
  of real, current, code-verified professionals — cleaner signal than LinkedIn
  or a PDF pile. Distribution we own; the individual product feeds the
  recruiter/team product. Teams/agencies get shared talent surfaces; students get
  a guided on-ramp. This is where a portfolio builder becomes a company.

**The discipline:** don't let pre-launch scaling anxiety pull us into rebuilding
infrastructure we don't need (microservices, replicas, delta storage). Fix the
five P0 items, apply the migrations, and spend the saved energy on the Job
Application feature and the freshness/analytics retention loop — that's what
turns "good portfolio builder" into "platform professionals rely on."

---

## Immediate next steps (concrete, implementable now)

- [ ] `R2ExportStore` swap (P0-1)
- [ ] DB index migration (P0-4)
- [ ] Apply migrations 0003–0012 on staging + smoke test (P0-5)
- [ ] Design doc for the **Job Application** entity (profile version +
      `ViewDefinition` tailoring overlay + cover letter) fitting the existing
      domain/projection model (Part 3)
- [ ] PgBouncer / pooled connection string in prod config (P0-2)
