import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { document } from "./documents";
import { profile } from "./profiles";

/**
 * Job match sessions (docs/architecture/13-ai-layer.md, Phase 7;
 * 07-storage.md).
 *
 * **A row here is one job the user is working on, not one thing the AI did.**
 * That distinction is why this table is not in `ai_chat_sessions` beside the
 * transcript that produced it, and why it lives in `@resfolio/job` rather than
 * `@resfolio/ai`: matching is how the row gets created today, but a tracked
 * application has nothing to do with a model. The columns below are already the
 * Application Tracker's columns — `status` in particular is written on every row
 * from the first save, so adding **Saved → Applied → Interviewing → Rejected /
 * Offer** later is a UI and a state machine over data that is already there,
 * rather than a migration over rows that predate the idea.
 *
 * **Profile-owned, like every other content table**, so deleting a profile takes
 * its job history with it in one cascade.
 *
 * Two columns are worth explaining because their absence would be the mistake:
 *
 * - **`job_description` is stored in full.** It is the input to every derived
 *   thing on the row — the match, the enhancement, the letter — and none of
 *   those can be recomputed or even explained without it. It is also what makes
 *   a re-match six weeks later meaningful.
 * - **`resume_document_id` is a reference with `on delete set null`**, not a
 *   copy. A resume is `Profile × config` and is edited after the fact (doc 02);
 *   snapshotting one here would produce a job row proudly pointing at a version
 *   of the resume that no longer exists anywhere else. Deleting the resume
 *   leaves the job — the application still happened.
 */
export const jobMatchSession = pgTable(
  "job_match_sessions",
  {
    /** Client-generated, like `ai_chat_sessions.id`, so the first save is an
     * upsert and a match never briefly belongs to no session. */
    id: uuid("id").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),

    /**
     * The conversation this match came out of, when it came out of one.
     *
     * **Plain text with no foreign key, deliberately.** Chat history is
     * disposable — "Clear history" deletes every transcript — and a job the user
     * is tracking must not be deleted along with the conversation that happened
     * to start it. A dangling id here is correct: the job outlives its origin
     * story.
     */
    chatSessionId: uuid("chat_session_id"),

    /** The posting's URL. Nullable: a JD is often pasted from an email or a PDF
     * with no link behind it, and refusing the match for want of a URL would be
     * refusing the common case. */
    jobUrl: text("job_url"),
    jobDescription: text("job_description").notNull(),

    /** Read off the posting by the model at match time. Nullable for the same
     * reason every derived field is: a posting that does not name its company
     * is a posting, not an error. */
    role: text("role"),
    company: text("company"),
    location: text("location"),

    /**
     * The score when the profile was first read against this posting, and the
     * score after an enhancement pass. **Two columns rather than one plus a
     * history**, because the product claim is exactly one comparison — "74% →
     * 86%" — and a general-purpose score log would be a table nobody reads to
     * answer a question nobody asks.
     *
     * `initial_score` is written once and never updated; that is what makes the
     * comparison honest when a second enhancement runs.
     */
    initialScore: integer("initial_score"),
    enhancedScore: integer("enhanced_score"),

    /** The verified analysis — requirements with their levels and resolved
     * evidence, plus keyword coverage. Stored so reopening a job shows what it
     * showed, without a second model call and without the numbers moving. */
    analysis: jsonb("analysis"),

    /** The profile changes accepted for this posting, as a record of what this
     * job caused. Not a way to undo them — the profile is the source of truth
     * and has moved on — but the answer to "what did I change for this one". */
    profileChanges: jsonb("profile_changes").notNull().default([]),

    resumeDocumentId: uuid("resume_document_id").references(() => document.id, {
      onDelete: "set null",
    }),

    /** The generated letter, as its structured parts (opening / body / closing)
     * rather than rendered prose — the PDF is composed from these, so storing
     * the rendering would store an output beside its own input. */
    coverLetter: jsonb("cover_letter"),

    /**
     * The tracker's state machine, seeded from the first save.
     *
     * **Written now, used later, and that is the point of writing it now.** Plain
     * text rather than a pg enum: the set will grow (screening, offer declined,
     * withdrawn), and adding a value to a pg enum is a migration where adding one
     * to a validated string is a deploy. The domain's Zod schema is what
     * constrains it.
     */
    status: text("status").notNull().default("saved"),

    /**
     * Every status this job has held, oldest first — `[{ status, at }]`.
     *
     * **The board needs `status`; the flow view needs this, and neither is
     * derivable from the other.** A row sitting in `rejected` might have been
     * turned down after three interviews or filtered out the day it was sent,
     * and the column above cannot tell those apart — so a funnel drawn from it
     * alone has to invent its own middle. Recording the change when it is made
     * is the only honest way to draw one.
     *
     * Same shape as `profile_changes`: a capped jsonb array, appended to and
     * never replaced, because this row is written many times over the life of
     * one application and history is the part that must survive all of them.
     *
     * Rows written before this column existed have `[]`, and the domain
     * synthesises a single event from `status` + `created_at` on the way out —
     * so an old job draws as one hop rather than disappearing from the diagram.
     * That is deliberately a read-time fallback and not a backfill: inventing
     * timestamps for transitions nobody observed would put fiction in the
     * table, where it would outlive the migration that wrote it.
     */
    statusHistory: jsonb("status_history").notNull().default([]),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // The list query: this profile's jobs, newest activity first. Composite
    // rather than two indexes — the sort is never done without the filter.
    index("job_match_sessions_profile_updated_idx").on(
      table.profileId,
      table.updatedAt.desc(),
    ),
    // The panel's query: the jobs belonging to the conversation on screen.
    index("job_match_sessions_chat_idx").on(table.chatSessionId),
  ],
);

export const jobMatchSessionRelations = relations(
  jobMatchSession,
  ({ one }) => ({
    profile: one(profile, {
      fields: [jobMatchSession.profileId],
      references: [profile.id],
    }),
    resume: one(document, {
      fields: [jobMatchSession.resumeDocumentId],
      references: [document.id],
    }),
  }),
);
