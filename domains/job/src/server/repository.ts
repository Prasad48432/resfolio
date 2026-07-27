import { and, desc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@resfolio/database";

import {
  coverLetterSchema,
  deriveJobTitle,
  normalizeJobUrl,
  storedAnalysisSchema,
  MAX_SESSIONS_PER_PROFILE,
  type CoverLetterContent,
  type JobMatchRecord,
  type JobMatchSummary,
  type JobStatus,
  type SaveJobMatchInput,
  type StoredAnalysis,
} from "../match";

/**
 * Job match persistence (docs/architecture/07-storage.md, 13-ai-layer.md).
 * **The only code that touches the `job_match_sessions` table.**
 *
 * Every function takes `userId` and resolves it to the profile that user owns
 * before it queries — ownership is enforced here and never assumed from the
 * caller (docs 06, 10). A stranger's job id resolves to nothing rather than to
 * somebody else's application.
 */

export class JobMatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobMatchError";
  }
}

/** The id of the profile a user owns, or throw. */
async function requireProfileId(userId: string): Promise<string> {
  const row = await db.query.profile.findFirst({
    where: eq(schema.profile.userId, userId),
    columns: { id: true },
  });
  if (!row) {
    throw new JobMatchError("No profile exists for this user.");
  }
  return row.id;
}

interface SummaryRow {
  id: string;
  role: string | null;
  company: string | null;
  jobUrl: string | null;
  status: string;
  initialScore: number | null;
  enhancedScore: number | null;
  resumeDocumentId: string | null;
  coverLetter: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toSummary(row: SummaryRow): JobMatchSummary {
  return {
    id: row.id,
    title: deriveJobTitle(row.role, row.company),
    company: row.company,
    jobUrl: row.jobUrl,
    // Widened from `text` on the way out. An unrecognised value means a row
    // written by a newer deploy than the one reading it; showing it as `saved`
    // is the reading that cannot mislead — it never claims progress that was
    // not made.
    status: isJobStatus(row.status) ? row.status : "saved",
    initialScore: row.initialScore,
    enhancedScore: row.enhancedScore,
    hasResume: row.resumeDocumentId !== null,
    hasCoverLetter: row.coverLetter !== null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isJobStatus(value: string): value is JobStatus {
  return (
    value === "saved" ||
    value === "applied" ||
    value === "interviewing" ||
    value === "rejected" ||
    value === "offer"
  );
}

/** The columns a list needs. **`job_description` is deliberately not among
 * them**: listing forty jobs must not mean loading forty postings. */
const SUMMARY_COLUMNS = {
  id: schema.jobMatchSession.id,
  role: schema.jobMatchSession.role,
  company: schema.jobMatchSession.company,
  jobUrl: schema.jobMatchSession.jobUrl,
  status: schema.jobMatchSession.status,
  initialScore: schema.jobMatchSession.initialScore,
  enhancedScore: schema.jobMatchSession.enhancedScore,
  resumeDocumentId: schema.jobMatchSession.resumeDocumentId,
  coverLetter: schema.jobMatchSession.coverLetter,
  createdAt: schema.jobMatchSession.createdAt,
  updatedAt: schema.jobMatchSession.updatedAt,
} as const;

/** This profile's jobs, newest activity first. */
export async function listJobMatches(
  userId: string,
): Promise<JobMatchSummary[]> {
  const profileId = await requireProfileId(userId);

  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(schema.jobMatchSession)
    .where(eq(schema.jobMatchSession.profileId, profileId))
    .orderBy(desc(schema.jobMatchSession.updatedAt))
    .limit(MAX_SESSIONS_PER_PROFILE);

  return rows.map(toSummary);
}

/**
 * The jobs that came out of one conversation, newest first.
 *
 * What the chat's artefact panel renders. Scoped by profile as well as by chat
 * id, because `chat_session_id` carries no foreign key (see the schema) and is
 * therefore not, on its own, a claim about who owns anything.
 */
export async function listJobMatchesForChat(
  userId: string,
  chatSessionId: string,
): Promise<JobMatchSummary[]> {
  const profileId = await requireProfileId(userId);

  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(schema.jobMatchSession)
    .where(
      and(
        eq(schema.jobMatchSession.profileId, profileId),
        eq(schema.jobMatchSession.chatSessionId, chatSessionId),
      ),
    )
    .orderBy(desc(schema.jobMatchSession.updatedAt));

  return rows.map(toSummary);
}

/**
 * One job with everything on it, or `null`.
 *
 * Null rather than a throw for a missing id: the common way to reach this is a
 * stale link or a job deleted in another tab, and neither should produce an
 * error page.
 */
export async function getJobMatch(
  userId: string,
  jobId: string,
): Promise<JobMatchRecord | null> {
  const profileId = await requireProfileId(userId);

  const row = await db.query.jobMatchSession.findFirst({
    where: and(
      eq(schema.jobMatchSession.id, jobId),
      eq(schema.jobMatchSession.profileId, profileId),
    ),
  });

  if (!row) {
    return null;
  }

  // Re-validated on the way out as well as in. A row written before a schema
  // change should surface as an unreadable analysis rather than as a panel that
  // renders somebody's career from a shape it does not understand.
  const analysis = storedAnalysisSchema.safeParse(row.analysis);
  const letter = coverLetterSchema.safeParse(row.coverLetter);

  return {
    ...toSummary(row),
    chatSessionId: row.chatSessionId,
    jobDescription: row.jobDescription,
    role: row.role,
    location: row.location,
    analysis: analysis.success ? analysis.data : null,
    profileChanges: Array.isArray(row.profileChanges) ? row.profileChanges : [],
    resumeDocumentId: row.resumeDocumentId,
    coverLetter: letter.success ? letter.data : null,
  };
}

/**
 * Create or update a job, merging rather than replacing.
 *
 * **An upsert on a client-generated id**, like `saveChatSession`, so a match can
 * be rendered before anything is stored and the first save is an upsert like
 * every later one.
 *
 * **The merge is the important part.** This row is written repeatedly as the user
 * works through one posting — matched, enhanced, given a résumé, given a letter —
 * and each of those saves knows about one field. A replace-everything upsert
 * would mean the cover-letter save clearing the score, so an absent key here
 * means "leave it alone" and only a key that is present is written. That is also
 * why `initialScore` is written **only on insert**: it is the baseline the
 * "74% → 86%" claim is measured against, and a baseline that moves is not one.
 */
export async function saveJobMatch(
  userId: string,
  input: SaveJobMatchInput,
): Promise<JobMatchSummary | null> {
  const profileId = await requireProfileId(userId);

  const jobUrl = normalizeJobUrl(input.jobUrl);
  const now = new Date();

  // Only the keys this call actually carries. Built rather than spread, because
  // `undefined` in a drizzle `set` is not the same as an absent key in every
  // version, and "the letter save quietly cleared the score" is the exact bug
  // this is guarding against.
  const set: Record<string, unknown> = {
    jobDescription: input.jobDescription,
    updatedAt: now,
  };

  if (input.jobUrl !== undefined) {
    set.jobUrl = jobUrl;
  }
  if (input.chatSessionId !== undefined) {
    set.chatSessionId = input.chatSessionId ?? null;
  }
  if (input.role !== undefined) {
    set.role = input.role ?? null;
  }
  if (input.company !== undefined) {
    set.company = input.company ?? null;
  }
  if (input.location !== undefined) {
    set.location = input.location ?? null;
  }
  if (input.enhancedScore !== undefined) {
    set.enhancedScore = input.enhancedScore ?? null;
  }
  if (input.analysis !== undefined) {
    set.analysis = input.analysis ?? null;
  }
  if (input.resumeDocumentId !== undefined) {
    set.resumeDocumentId = input.resumeDocumentId ?? null;
  }
  if (input.coverLetter !== undefined) {
    set.coverLetter = input.coverLetter ?? null;
  }
  if (input.status !== undefined) {
    set.status = input.status;
  }
  if (input.profileChanges !== undefined) {
    set.profileChanges = input.profileChanges;
  }

  const [row] = await db
    .insert(schema.jobMatchSession)
    .values({
      id: input.id,
      profileId,
      chatSessionId: input.chatSessionId ?? null,
      jobDescription: input.jobDescription,
      jobUrl,
      role: input.role ?? null,
      company: input.company ?? null,
      location: input.location ?? null,
      initialScore: input.initialScore ?? null,
      enhancedScore: input.enhancedScore ?? null,
      analysis: input.analysis ?? null,
      profileChanges: input.profileChanges ?? [],
      resumeDocumentId: input.resumeDocumentId ?? null,
      coverLetter: input.coverLetter ?? null,
      status: input.status ?? "saved",
    })
    .onConflictDoUpdate({
      target: schema.jobMatchSession.id,
      // **Scoped to the owner**, for the reason spelled out in
      // `@resfolio/ai`'s repository: `id` is both the conflict target and the
      // primary key, so the insert's own `profile_id` never gets a say on
      // conflict. Without this clause a request naming somebody else's job id
      // would update their row.
      setWhere: eq(schema.jobMatchSession.profileId, profileId),
      set,
    })
    .returning(SUMMARY_COLUMNS);

  // The id exists but belongs to another profile: nothing was written and
  // nothing is returned. Silent by design — reporting it would report something
  // about another account.
  if (!row) {
    return null;
  }

  await pruneOldestJobs(profileId);

  return toSummary(row);
}

/** Record the accepted enhancement: the new score, and what was applied. Kept
 * apart from {@link saveJobMatch} because it **appends** to `profileChanges`
 * rather than setting them — two enhancement passes for one posting are two sets
 * of changes, and the second overwriting the first would lose the record of the
 * first. */
export async function recordJobEnhancement(
  userId: string,
  jobId: string,
  input: { enhancedScore?: number | null; appliedChanges: unknown[] },
): Promise<JobMatchSummary | null> {
  const profileId = await requireProfileId(userId);

  const existing = await db.query.jobMatchSession.findFirst({
    where: and(
      eq(schema.jobMatchSession.id, jobId),
      eq(schema.jobMatchSession.profileId, profileId),
    ),
    columns: { profileChanges: true },
  });

  if (!existing) {
    return null;
  }

  const previous = Array.isArray(existing.profileChanges)
    ? existing.profileChanges
    : [];

  const [row] = await db
    .update(schema.jobMatchSession)
    .set({
      profileChanges: [...previous, ...input.appliedChanges].slice(-200),
      ...(input.enhancedScore === undefined
        ? {}
        : { enhancedScore: input.enhancedScore }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.jobMatchSession.id, jobId),
        eq(schema.jobMatchSession.profileId, profileId),
      ),
    )
    .returning(SUMMARY_COLUMNS);

  return row ? toSummary(row) : null;
}

/** Store a generated letter. Its own function rather than a `saveJobMatch`
 * call, so the letter path never has to restate the posting it belongs to. */
export async function saveCoverLetter(
  userId: string,
  jobId: string,
  letter: CoverLetterContent,
): Promise<boolean> {
  const profileId = await requireProfileId(userId);

  const updated = await db
    .update(schema.jobMatchSession)
    .set({ coverLetter: letter, updatedAt: new Date() })
    .where(
      and(
        eq(schema.jobMatchSession.id, jobId),
        eq(schema.jobMatchSession.profileId, profileId),
      ),
    )
    .returning({ id: schema.jobMatchSession.id });

  return updated.length > 0;
}

/**
 * Move a job through the tracker.
 *
 * **The Application Tracker's only write, present before the tracker is.** It
 * costs four lines and it is what makes the claim in this package's header true
 * rather than aspirational: the states exist, they are validated, and the row
 * already carries one.
 */
export async function setJobStatus(
  userId: string,
  jobId: string,
  status: JobStatus,
): Promise<boolean> {
  const profileId = await requireProfileId(userId);

  const updated = await db
    .update(schema.jobMatchSession)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(schema.jobMatchSession.id, jobId),
        eq(schema.jobMatchSession.profileId, profileId),
      ),
    )
    .returning({ id: schema.jobMatchSession.id });

  return updated.length > 0;
}

export async function deleteJobMatch(
  userId: string,
  jobId: string,
): Promise<boolean> {
  const profileId = await requireProfileId(userId);

  const deleted = await db
    .delete(schema.jobMatchSession)
    .where(
      and(
        eq(schema.jobMatchSession.id, jobId),
        eq(schema.jobMatchSession.profileId, profileId),
      ),
    )
    .returning({ id: schema.jobMatchSession.id });

  return deleted.length > 0;
}

/**
 * Drop everything past the per-profile ceiling, oldest first. Runs after a save
 * rather than on a schedule — the only moment the count can grow is the moment
 * one is written.
 */
async function pruneOldestJobs(profileId: string): Promise<void> {
  const doomed = await db
    .select({ id: schema.jobMatchSession.id })
    .from(schema.jobMatchSession)
    .where(eq(schema.jobMatchSession.profileId, profileId))
    .orderBy(desc(schema.jobMatchSession.updatedAt))
    .offset(MAX_SESSIONS_PER_PROFILE);

  if (doomed.length === 0) {
    return;
  }

  await db.delete(schema.jobMatchSession).where(
    and(
      eq(schema.jobMatchSession.profileId, profileId),
      inArray(
        schema.jobMatchSession.id,
        doomed.map((row) => row.id),
      ),
    ),
  );
}

export type { StoredAnalysis };
