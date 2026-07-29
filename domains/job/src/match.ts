import { z } from "zod";

/**
 * Job match sessions — the pure half
 * (docs/architecture/13-ai-layer.md, Phase 7).
 *
 * **A job match session is one job the user is working on.** Today it is created
 * by a match and carries a score, a set of accepted profile changes, a resume
 * reference and a letter. **The same row is the tracker's card**, moving through
 * Saved → Applied → Interviewing → Offer / Rejected / Ghosted, and carrying the
 * history of how it got there. Nothing in this file mentions a model, and that is
 * deliberate: matching is how a row gets made, not what a row is. The prompts,
 * the provider and every model call stay in `apps/dashboard/lib/ai/` — see
 * `../CLAUDE.md`.
 *
 * The one boundary worth stating up front: **what the model emits and what gets
 * stored are two schemas, not one.** The dashboard's `lib/ai/job-analysis.ts`
 * describes what a model is asked to produce — citations as raw id strings,
 * levels it claims. {@link storedAnalysisSchema} below describes what survived
 * verification: evidence that resolved to a real profile item, levels that were
 * demoted when they did not, and the arithmetic. Collapsing the two would mean
 * either the domain knowing what a prompt looks like, or an unverified claim
 * being storable.
 */

/**
 * The tracker's states, in the order a job moves through them.
 *
 * **Written on every row from the first save, with the tracker itself
 * deliberately unbuilt.** That is the whole reason this list exists now: a
 * `status` column that appears in a later migration has to be backfilled with a
 * guess about rows that predate the concept, whereas one written from the start
 * is simply true. `saved` is where a match lands, and it is already the honest
 * description of what the user did.
 *
 * The three terminal states are kept apart rather than collapsed into "closed",
 * because the difference between them is the only thing anyone would ever filter
 * on — and, now that the flow view exists, the only thing worth counting.
 * `ghosted` in particular is not a variety of `rejected`: an application nobody
 * answered says something about the *employer*, and a job search where half the
 * applications vanish is a different problem from one where half are turned
 * down. Reading them as one number hides the more actionable of the two.
 *
 * **The order is the board's order**, left to right, so the columns are rendered
 * from this array rather than from a second list that could disagree with it.
 */
export const JOB_STATUSES = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "ghosted",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const jobStatusSchema = z.enum(JOB_STATUSES);

/**
 * A status change, as it happened.
 *
 * **The tracker's board needs the current status; the flow view needs the
 * journey, and one cannot be derived from the other.** A row sitting in
 * `rejected` might have been turned down after three interviews or filtered out
 * on the day it was sent, and a snapshot has no way to tell those apart — so a
 * flow drawn from the `status` column alone has to guess at its own middle. It
 * would draw every offer as having interviewed, which is not always true, and
 * could never draw "declined after interview" at all.
 *
 * So each change is recorded when it is made. This is the same shape
 * `profile_changes` already uses — a capped jsonb array, appended to, never
 * replaced — and for the same reason: the row is written repeatedly over the
 * life of one application, and history is the part of it that must survive
 * every one of those writes.
 */
export const statusEventSchema = z.object({
  status: jobStatusSchema,
  /** `coerce`, because this round-trips through JSON as a string. */
  at: z.coerce.date(),
});

export type JobStatusEvent = z.infer<typeof statusEventSchema>;

/** A job that changed status a hundred times is a test fixture, not a job
 * search. The cap exists so one row cannot grow without bound. */
export const MAX_STATUS_EVENTS = 100;

export const statusHistorySchema = z
  .array(statusEventSchema)
  .max(MAX_STATUS_EVENTS);

/**
 * The score below which enhancing the profile for a posting asks first.
 *
 * **A product rule, not a threshold on a model's confidence.** Under it, the
 * honest reading is that this is not really the user's job — and rewriting a
 * career record to chase a role it does not fit is the one outcome this feature
 * has to make deliberate rather than easy. Above it, the enhancement is ordinary
 * work and a confirmation dialog would be a click charged for nothing.
 *
 * It lives here rather than in the dashboard because it describes what a job
 * match *means*, and because the copy on the dialog quotes the number.
 */
export const ENHANCE_CONFIRM_THRESHOLD = 70;

/**
 * A stored job description, and **deliberately looser than what the dashboard
 * accepts** (`lib/ai/limits.ts` now stops at 12,000).
 *
 * A column has to bound itself — the two are checked independently and neither
 * trusts the other — but they are not the same bound and should not be kept in
 * sync. The app's limit is a *cost* control on what may be sent to a model and it
 * will move as pricing does; this one is a *storage* ceiling, and lowering it to
 * chase the app's would make rows written by an earlier deploy unwritable by a
 * later one. Wider here, narrower there, is the correct direction.
 */
export const MAX_JOB_DESCRIPTION_CHARS = 20_000;

/** Job rows kept per profile. A tracker is a working list, not an archive;
 * past this the oldest are deleted on the next save, so the table cannot grow
 * without anyone choosing to fill it. */
export const MAX_SESSIONS_PER_PROFILE = 200;

/** A title has to fit one line of the panel's header without a tooltip. */
export const MAX_TITLE_CHARS = 80;

/** What a job with no readable role is called. A blank row is a row the user
 * cannot identify or trust enough to click. */
export const UNTITLED_JOB = "Untitled job";

/**
 * A requirement as it is *kept* — after verification, never before.
 *
 * `evidence` holds resolved profile items rather than the id strings the model
 * cited, which is the difference between a record and a claim: an id that
 * pointed at nothing was dropped and, if it was the only support for a match,
 * `downgraded` says the level was demoted to `gap`. Storing the raw citations
 * would preserve exactly the fabrication the verification step exists to catch.
 */
export const storedRequirementSchema = z.object({
  text: z.string().trim().min(1).max(300),
  level: z.enum(["strong", "partial", "gap"]),
  note: z.string().trim().max(240),
  evidence: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        section: z.string().min(1).max(40),
        label: z.string().max(200),
      }),
    )
    .max(6),
  downgraded: z.boolean().default(false),
});

export const storedAnalysisSchema = z.object({
  requirements: z.array(storedRequirementSchema).max(40),
  keywords: z
    .array(
      z.object({
        keyword: z.string().trim().min(1).max(60),
        present: z.boolean(),
      }),
    )
    .max(40),
  summary: z.object({
    score: z.number().int().min(0).max(100),
    strong: z.number().int().min(0),
    partial: z.number().int().min(0),
    gap: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
});

export type StoredAnalysis = z.infer<typeof storedAnalysisSchema>;
export type StoredRequirement = z.infer<typeof storedRequirementSchema>;

/**
 * The letter, as its parts.
 *
 * **Stored as structure rather than as rendered prose**, because the PDF is
 * composed from these parts and the greeting and sign-off are composed by the
 * platform from the recipient and the profile's own name. Storing the rendered
 * page would store an output beside its own input and let the two disagree the
 * first time the letter's layout changes.
 */
export const coverLetterSchema = z.object({
  opening: z.string().trim().min(1).max(2_000),
  body: z.array(z.string().trim().min(1).max(2_000)).max(5),
  closing: z.string().trim().min(1).max(2_000),
  /** Who it is addressed to, as the user typed it. Optional: "Dear Hiring
   * Manager" is the correct letter when nobody is named, and asking for a name
   * nobody has is worse than not addressing one. */
  recipient: z.string().trim().max(120).optional(),
});

export type CoverLetterContent = z.infer<typeof coverLetterSchema>;

/**
 * What a save may set.
 *
 * **Every field is optional except the job description**, because this row is
 * written repeatedly as the user works through one posting — matched, then
 * enhanced, then given a resume, then a letter — and a save that had to restate
 * everything would be a save that can clear a field by forgetting it. The
 * repository merges rather than replaces, and the *absence* of a key means "leave
 * it alone" rather than "set it to nothing".
 */
export const saveJobMatchInputSchema = z.object({
  id: z.uuid(),
  chatSessionId: z.uuid().nullish(),
  jobDescription: z.string().trim().min(1).max(MAX_JOB_DESCRIPTION_CHARS),
  jobUrl: z.string().trim().max(2_000).nullish(),
  role: z.string().trim().max(160).nullish(),
  company: z.string().trim().max(160).nullish(),
  location: z.string().trim().max(160).nullish(),
  initialScore: z.number().int().min(0).max(100).nullish(),
  enhancedScore: z.number().int().min(0).max(100).nullish(),
  analysis: storedAnalysisSchema.nullish(),
  /** Appended to, never replaced — see the repository. An enhancement pass adds
   * what it applied to what earlier passes applied. */
  profileChanges: z.array(z.unknown()).max(200).optional(),
  resumeDocumentId: z.uuid().nullish(),
  coverLetter: coverLetterSchema.nullish(),
  status: jobStatusSchema.optional(),
});

export type SaveJobMatchInput = z.infer<typeof saveJobMatchInputSchema>;

/**
 * What the tracker may edit on a card by hand.
 *
 * **Separate from {@link saveJobMatchInputSchema} because that one requires the
 * job description**, and correcting a company name the model misread must not
 * mean shipping four thousand characters of posting back to the server to do it.
 * That requirement is right where it is — a save from the match flow always has
 * the posting, and making it optional there would let a later save blank the one
 * field everything else is derived from — so this is a second, narrower door
 * rather than a loosening of the first.
 *
 * Deliberately not here: `status` (its own function, because it records
 * history), scores, the analysis, and the letter. Those are results, and a
 * tracker that let you type your own match score would be a tracker whose
 * numbers mean nothing.
 */
export const updateJobDetailsInputSchema = z.object({
  role: z.string().trim().max(160).nullish(),
  company: z.string().trim().max(160).nullish(),
  location: z.string().trim().max(160).nullish(),
  jobUrl: z.string().trim().max(2_000).nullish(),
});

export type UpdateJobDetailsInput = z.infer<typeof updateJobDetailsInputSchema>;

/** A row of the panel and, later, of the tracker board: enough to identify and
 * rank a job, and none of its bulk. Listing forty jobs must not mean loading
 * forty job descriptions. */
export interface JobMatchSummary {
  id: string;
  title: string;
  /**
   * The role and location as read off the posting.
   *
   * **`title` is derived from `role` and is lossy** — it joins, and it ellipsises
   * at {@link MAX_TITLE_CHARS} — so a screen that lets the user correct a role
   * cannot reconstruct one from it. The tracker's edit form does exactly that,
   * and deriving the field back out of the title would silently write a truncated
   * role over a whole one the first time somebody fixed a typo on a long title.
   * Two short text columns; the rule this list keeps is about `job_description`
   * and `profile_changes`, which are large.
   */
  role: string | null;
  company: string | null;
  location: string | null;
  jobUrl: string | null;
  status: JobStatus;
  initialScore: number | null;
  enhancedScore: number | null;
  hasResume: boolean;
  hasCoverLetter: boolean;
  /**
   * This posting has already caused profile changes the user accepted.
   *
   * Derived from `profile_changes` being non-empty, and the reason it is on the
   * *summary* rather than only on the record: the chat renders a job match card
   * per tool result, and "offer to enhance" is the wrong thing to show above a
   * profile that was already enhanced for this exact posting. A card that has to
   * load the whole record to decide whether to show a button is a card that shows
   * the button first and then takes it away.
   */
  hasEnhancement: boolean;
  /**
   * Which resume this application sends, if one has been chosen.
   *
   * On the summary as well as the record because two screens ask the same
   * question of a list: the board card wants to say "has a resume", and the
   * optimise card in the chat wants to know whether *this* resume has already
   * been pointed at *this* posting — which `hasResume` cannot answer, and which
   * is the difference between offering the work and offering to redo it.
   */
  resumeDocumentId: string | null;
  /**
   * Every status this job has held, oldest first — see {@link statusEventSchema}.
   *
   * On the summary because the flow view is built from *all* the user's jobs at
   * once: fetching each one's record to draw a diagram of forty applications is
   * forty reads for a handful of timestamps. It is small by construction (a
   * status and a date, capped at {@link MAX_STATUS_EVENTS}), which is what makes
   * it affordable here in a way `job_description` is not.
   */
  statusHistory: JobStatusEvent[];
  createdAt: Date;
  updatedAt: Date;
}

/** A job with everything on it — what opening one returns. */
export interface JobMatchRecord extends JobMatchSummary {
  chatSessionId: string | null;
  jobDescription: string;
  analysis: StoredAnalysis | null;
  profileChanges: unknown[];
  coverLetter: CoverLetterContent | null;
}

/**
 * What to call a job in a list.
 *
 * Derived from the posting the way a chat title is derived from its first
 * message — never asked for, never generated by a model. "Senior Engineer at
 * Acme" is what somebody scans a list for; a model-written summary of it would
 * be paying for a paraphrase of two fields.
 */
export function deriveJobTitle(
  role: string | null | undefined,
  company: string | null | undefined,
): string {
  const cleanRole = role?.trim() ?? "";
  const cleanCompany = company?.trim() ?? "";

  const joined =
    cleanRole && cleanCompany
      ? `${cleanRole} at ${cleanCompany}`
      : cleanRole || cleanCompany;

  if (joined === "") {
    return UNTITLED_JOB;
  }

  return joined.length <= MAX_TITLE_CHARS
    ? joined
    : `${joined.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`;
}

/**
 * The posting's URL, or null.
 *
 * **`http`/`https` only, and the check is what makes rendering it as a link
 * safe.** The value arrives from a chat message a model read, so `javascript:`
 * is not a hypothetical — it is the one string that turns a stored field into
 * script execution when someone clicks the "Job posting" link. Rejected rather
 * than sanitised: there is no useful `javascript:` job posting to salvage.
 *
 * A bare `acme.com/jobs/1` is accepted and promoted to `https://`, because that
 * is what people paste and refusing it would be pedantry with a cost.
 */
export function normalizeJobUrl(
  value: string | null | undefined,
): string | null {
  const raw = value?.trim() ?? "";
  if (raw === "") {
    return null;
  }

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  // A hostname with no dot is not a posting anyone can open — it is usually a
  // fragment of prose the model mistook for a link ("remote").
  if (!url.hostname.includes(".")) {
    return null;
  }

  return url.toString().slice(0, 2_000);
}

/**
 * The score to show, and whether it moved.
 *
 * `enhancedScore` is authoritative once it exists, and the delta is only
 * reported when both numbers are present — "+12" against an absent baseline is a
 * claim about an improvement nobody measured.
 */
export function scoreView(job: {
  initialScore: number | null;
  enhancedScore: number | null;
}): { score: number | null; previous: number | null; delta: number | null } {
  const { initialScore, enhancedScore } = job;

  if (enhancedScore === null) {
    return { score: initialScore, previous: null, delta: null };
  }

  if (initialScore === null) {
    return { score: enhancedScore, previous: null, delta: null };
  }

  return {
    score: enhancedScore,
    previous: initialScore,
    delta: enhancedScore - initialScore,
  };
}

/** Whether enhancing for this posting should ask first — see
 * {@link ENHANCE_CONFIRM_THRESHOLD}. An unscored job asks, because "we don't
 * know how well this fits" is not a reason to skip the question. */
export function needsEnhanceConfirmation(score: number | null): boolean {
  return score === null || score < ENHANCE_CONFIRM_THRESHOLD;
}
