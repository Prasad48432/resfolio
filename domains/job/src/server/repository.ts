import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "@resfolio/database";

import {
  coverLetterSchema,
  deriveJobTitle,
  normalizeJobUrl,
  statusHistorySchema,
  storedAnalysisSchema,
  JOB_STATUSES,
  MAX_SESSIONS_PER_PROFILE,
  MAX_STATUS_EVENTS,
  type CoverLetterContent,
  type JobMatchRecord,
  type JobMatchSummary,
  type JobStatus,
  type JobStatusEvent,
  type SaveJobMatchInput,
  type StoredAnalysis,
  type UpdateJobDetailsInput,
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
  location: string | null;
  jobUrl: string | null;
  status: string;
  initialScore: number | null;
  enhancedScore: number | null;
  resumeDocumentId: string | null;
  coverLetter: unknown;
  /** How many profile changes this posting has caused, computed in SQL. See
   * {@link SUMMARY_COLUMNS} for why it is a count rather than the array. */
  profileChangeCount: number;
  statusHistory: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toSummary(row: SummaryRow): JobMatchSummary {
  const status = isJobStatus(row.status) ? row.status : "saved";

  return {
    id: row.id,
    title: deriveJobTitle(row.role, row.company),
    role: row.role,
    company: row.company,
    location: row.location,
    jobUrl: row.jobUrl,
    // Widened from `text` on the way out. An unrecognised value means a row
    // written by a newer deploy than the one reading it; showing it as `saved`
    // is the reading that cannot mislead — it never claims progress that was
    // not made.
    status,
    initialScore: row.initialScore,
    enhancedScore: row.enhancedScore,
    hasResume: row.resumeDocumentId !== null,
    hasCoverLetter: row.coverLetter !== null,
    hasEnhancement: Number(row.profileChangeCount) > 0,
    resumeDocumentId: row.resumeDocumentId,
    statusHistory: readStatusHistory(row.statusHistory, status, row.createdAt),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * The recorded history, or one synthesised event for a row that predates the
 * column.
 *
 * **A read-time fallback rather than a backfill migration.** The only honest
 * thing that can be said about a job written before history existed is where it
 * is now and when it was created; writing invented transition timestamps into
 * the table would put fiction somewhere it outlives the migration that put it
 * there, and every later read would trust it. Here the fabrication is confined
 * to one hop that is true by construction — the row does hold that status — and
 * disappears the moment the user moves the card.
 *
 * A history that fails validation is treated the same way. A diagram drawn from
 * a shape this code does not understand is worse than one drawn from the single
 * fact it is certain of.
 */
function readStatusHistory(
  value: unknown,
  status: JobStatus,
  createdAt: Date,
): JobStatusEvent[] {
  const parsed = statusHistorySchema.safeParse(value);
  if (parsed.success && parsed.data.length > 0) {
    return parsed.data;
  }
  return [{ status, at: createdAt }];
}

function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

/** The columns a list needs. **`job_description` is deliberately not among
 * them**: listing forty jobs must not mean loading forty postings. */
const SUMMARY_COLUMNS = {
  id: schema.jobMatchSession.id,
  role: schema.jobMatchSession.role,
  company: schema.jobMatchSession.company,
  location: schema.jobMatchSession.location,
  jobUrl: schema.jobMatchSession.jobUrl,
  status: schema.jobMatchSession.status,
  initialScore: schema.jobMatchSession.initialScore,
  enhancedScore: schema.jobMatchSession.enhancedScore,
  resumeDocumentId: schema.jobMatchSession.resumeDocumentId,
  coverLetter: schema.jobMatchSession.coverLetter,
  /**
   * **A count computed in SQL, not the array itself**, for the same reason
   * `job_description` is absent: `profile_changes` holds up to 200 whole
   * `ProfileChange` objects, and a list of forty jobs has no use for eight
   * thousand of them. The summary only ever answers "has this posting already
   * been enhanced for", which is one integer.
   *
   * `coalesce` because the column is `jsonb` with an array default — a row that
   * somehow holds `null` counts as zero rather than failing the whole list.
   */
  profileChangeCount: sql<number>`coalesce(jsonb_array_length(${schema.jobMatchSession.profileChanges}), 0)`,
  /**
   * **The one jsonb column that *is* selected in a list**, and the exception is
   * earned rather than an inconsistency. The flow view is built from all of a
   * profile's jobs at once, so anything it needs per row has to come back with
   * the list or it is forty extra reads. This column is a status and a date,
   * capped at {@link MAX_STATUS_EVENTS} — the reason `profile_changes` is
   * counted instead of selected is that it holds up to 200 whole objects, which
   * is a fact about that column and not a rule about jsonb.
   */
  statusHistory: schema.jobMatchSession.statusHistory,
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
  // This read has the whole array, so the count `toSummary` wants is derived
  // here rather than asked of the database a second time. The list query counts
  // in SQL instead — see `SUMMARY_COLUMNS`.
  const profileChanges = Array.isArray(row.profileChanges)
    ? row.profileChanges
    : [];

  return {
    ...toSummary({ ...row, profileChangeCount: profileChanges.length }),
    chatSessionId: row.chatSessionId,
    jobDescription: row.jobDescription,
    analysis: analysis.success ? analysis.data : null,
    profileChanges,
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
 * works through one posting — matched, enhanced, given a resume, given a letter —
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
      // Seeded on insert only, exactly like `initialScore` above and for the
      // same reason: it is a baseline. It is absent from `set` on purpose — a
      // later save re-seeding it would erase the journey it is supposed to be
      // recording. `setJobStatus` is the only thing that appends.
      statusHistory: [{ status: input.status ?? "saved", at: now }],
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
 * Move a job through the tracker, recording that it moved.
 *
 * **The status and the history are one write, and that is the whole design.**
 * The board reads the column; the flow view reads the array; if either could be
 * updated without the other they would drift, and the drift would show up as a
 * diagram that quietly disagrees with the board beside it.
 *
 * **A move to the status the job already holds records nothing.** Dropping a
 * card back into the column it came from is the most ordinary thing to do with a
 * kanban board and it is not an event — counting it would put a self-loop in the
 * funnel and inflate every stage the card sat in.
 */
export async function setJobStatus(
  userId: string,
  jobId: string,
  status: JobStatus,
): Promise<boolean> {
  const profileId = await requireProfileId(userId);

  const existing = await db.query.jobMatchSession.findFirst({
    where: and(
      eq(schema.jobMatchSession.id, jobId),
      eq(schema.jobMatchSession.profileId, profileId),
    ),
    columns: { status: true, statusHistory: true, createdAt: true },
  });

  if (!existing) {
    return false;
  }

  const current = isJobStatus(existing.status) ? existing.status : "saved";
  if (current === status) {
    // Already there. Reported as success because it is: the caller asked for a
    // state the row is in, and an optimistic board that put the card back on a
    // `false` would be undoing a move the user can see already happened.
    return true;
  }

  // Read through the same fallback the summary uses, so a row written before the
  // column existed gains its synthesised first hop here rather than starting its
  // history at the second move.
  const history = readStatusHistory(
    existing.statusHistory,
    current,
    existing.createdAt,
  );

  const updated = await db
    .update(schema.jobMatchSession)
    .set({
      status,
      statusHistory: [...history, { status, at: new Date() }].slice(
        -MAX_STATUS_EVENTS,
      ),
      updatedAt: new Date(),
    })
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
 * Correct a card's facts by hand.
 *
 * **Narrower than {@link saveJobMatch} on purpose.** That one requires the job
 * description — rightly, since every derived thing on the row comes from it and
 * a save allowed to omit it is a save that can blank it — so fixing a company
 * name the model misread would otherwise mean posting four thousand characters
 * back to the server. This is a second, smaller door rather than a loosening of
 * the first.
 *
 * Only the four fields a human can reasonably know better than the model. Scores
 * and the analysis are results, not opinions, and a tracker whose match score
 * you can type is a tracker whose numbers mean nothing.
 */
export async function updateJobDetails(
  userId: string,
  jobId: string,
  input: UpdateJobDetailsInput,
): Promise<JobMatchSummary | null> {
  const profileId = await requireProfileId(userId);

  // Same merge rule as `saveJobMatch`: an absent key leaves the field alone, a
  // present null clears it. The tracker's edit form sends every field, but the
  // rule holds for the caller that does not.
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.role !== undefined) {
    set.role = input.role || null;
  }
  if (input.company !== undefined) {
    set.company = input.company || null;
  }
  if (input.location !== undefined) {
    set.location = input.location || null;
  }
  if (input.jobUrl !== undefined) {
    // Through the same refusal as every other write of this column — a link
    // typed into the tracker is no more trustworthy than one a model read.
    set.jobUrl = normalizeJobUrl(input.jobUrl);
  }

  const [row] = await db
    .update(schema.jobMatchSession)
    .set(set)
    .where(
      and(
        eq(schema.jobMatchSession.id, jobId),
        eq(schema.jobMatchSession.profileId, profileId),
      ),
    )
    .returning(SUMMARY_COLUMNS);

  return row ? toSummary(row) : null;
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
