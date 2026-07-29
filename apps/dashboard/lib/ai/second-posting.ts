import { normalizeJobUrl } from "@resfolio/job";

import { MIN_JOB_DESCRIPTION_CHARS } from "./job-analysis";

/**
 * "You are about to paste a second job into this conversation."
 *
 * ## Why this exists
 *
 * Every turn re-reads the whole transcript. A conversation that already carries
 * a 12,000-character posting costs that much again on the next message, and
 * again on the one after — so a second posting pasted into the same thread is
 * paid for twice over, before anything else goes wrong. And things do go wrong:
 * one chat, one artefact panel and one resume slot now describe two jobs, and
 * `findJobDescription` walks back to the *most recent* long message, so asking
 * for a re-check of the first job silently re-checks the second.
 *
 * ## Why it is pure
 *
 * **Detecting this must not itself cost a model call**, or the fix is a smaller
 * version of the problem. Everything needed is already in the browser: the
 * postings are on the `tool-analyzeJobMatch` parts of the transcript, and the
 * pending text is in the composer. No request, no database, no round trip.
 *
 * ## What is deliberately not flagged
 *
 * Chatting your way toward one posting is the normal, good use of this screen —
 * "enhance my summary", "rewrite the Ezra project", "what am I missing?" — and
 * so is pasting a posting into a conversation that has been about nothing else.
 * All of those fail the length test in {@link readsAsPosting}. **Re-pasting the
 * same posting is not a second job either**, which is the case the fingerprint
 * in {@link looksLikeNewPosting} exists for: people paste a link, then the
 * description, then the description again with the benefits trimmed.
 *
 * The failure that matters here is the false positive. A nudge in front of an
 * ordinary message is a product interrupting a user who did nothing wrong, and
 * a nudge that fires often enough is one that gets clicked through without
 * being read — at which point the real one is invisible too.
 */

export interface PostingInChat {
  jobId: string;
  /** "Senior Engineer at Acme", for the sentence that names it. */
  title: string;
  jobUrl: string | null;
  jobDescription: string;
}

/**
 * Just enough of a transcript to read tool results out of.
 *
 * **Structural rather than `AiUIMessage`, because both sides of the boundary
 * call this.** The browser has the SDK's typed messages; the chat route has
 * whatever `parseChatRequest` validated, which is deliberately looser. One
 * implementation, so the composer's idea of "this chat already has a job" and
 * the server's can never diverge.
 */
interface TranscriptLike {
  /** `unknown`, and narrowed inside. A shape like `{ type: string }` here reads
   * tighter but is actually wrong in both directions: it rejects the SDK's own
   * richer part types under excess-property checking, and it promises a `type`
   * this function has to verify at runtime anyway. */
  parts: readonly unknown[];
}

/**
 * The postings this conversation has already analysed, oldest first.
 *
 * Read off the tool results rather than from the job list, because the tool
 * result is what carries the *posting* — the summary rows deliberately do not,
 * and a comparison needs the text.
 */
export function postingsInTranscript(
  messages: readonly TranscriptLike[],
): PostingInChat[] {
  const postings: PostingInChat[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      const candidate = part as {
        type?: unknown;
        state?: unknown;
        output?: Record<string, unknown>;
      } | null;

      if (
        !candidate ||
        candidate.type !== "tool-analyzeJobMatch" ||
        candidate.state !== "output-available"
      ) {
        continue;
      }
      const output = candidate.output;
      // The "no posting" and "already analysed" results carry no job. Narrowed
      // by shape rather than with `isJobMatchUnavailable`, so this module needs
      // none of the tool types — which is what lets it be structural at all.
      if (
        !output ||
        typeof output.jobId !== "string" ||
        typeof output.jobDescription !== "string"
      ) {
        continue;
      }

      const role = typeof output.role === "string" ? output.role : "";
      const company =
        typeof output.company === "string" ? output.company : null;

      postings.push({
        jobId: output.jobId,
        title: company ? `${role} at ${company}` : role || "this job",
        jobUrl: typeof output.jobUrl === "string" ? output.jobUrl : null,
        jobDescription: output.jobDescription,
      });
    }
  }

  return postings;
}

/**
 * Does this message read as a job posting?
 *
 * Two ways in, and both are shapes a person actually pastes:
 *
 * - **Long enough to be one.** The same {@link MIN_JOB_DESCRIPTION_CHARS} the
 *   server uses to pick the posting out of a transcript — one threshold rather
 *   than two, so this can never warn about a message the analysis would ignore,
 *   or stay quiet about one it would act on.
 * - **A bare link.** Short, so the length test misses it, and yet unmistakably
 *   the start of a new job: nobody drops a `jobs.acme.com/…` URL into a chat
 *   about a posting they are already discussing. Bounded to a couple of lines so
 *   a paragraph that happens to contain a URL is not mistaken for one.
 */
export function readsAsPosting(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed.length >= MIN_JOB_DESCRIPTION_CHARS) {
    return true;
  }

  const lines = trimmed.split(/\s+/);
  if (lines.length > 2) {
    return false;
  }

  // Only a token that already looks like a link. `normalizeJobUrl` promotes a
  // bare host, which is right when someone pastes `acme.com/jobs/1` — but it
  // would also promote "Node.js", and a message reading "Node.js" is not a job.
  const candidate = lines.find((token) => /^(https?:\/\/|www\.)/i.test(token));
  return candidate !== undefined && normalizeJobUrl(candidate) !== null;
}

/** Lowercased, whitespace-collapsed, and cut to a length that survives an edit.
 * Two pastes of the same posting differ in trailing boilerplate far more often
 * than in their opening paragraph. */
function fingerprint(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
}

/**
 * Are these the same posting?
 *
 * **Shared by the composer's guard and the tool's**, deliberately: the browser
 * decides whether to warn and the server decides whether to spend a model call,
 * and two implementations of "same job" would eventually disagree — at which
 * point the product either refuses work the user asked for or bills for work it
 * said it would not do.
 *
 * It is what separates "recalculate the match" (the same posting, still the most
 * recent long message in the transcript) from a second job.
 */
export function isSamePosting(a: string, b: string): boolean {
  return fingerprint(a) === fingerprint(b);
}

function firstUrl(text: string): string | null {
  const token = text.trim().split(/\s+/)[0];
  return token ? normalizeJobUrl(token) : null;
}

/**
 * The posting this chat is already about, if the pending text is a different
 * one. `null` means send normally.
 *
 * Returns the *existing* posting rather than a boolean, because the sentence
 * that has to be written is "this chat is already about X" — a warning that
 * cannot name the job it is protecting is a warning the user has to go and
 * verify themselves.
 */
export function looksLikeNewPosting(
  pending: string,
  existing: readonly PostingInChat[],
): PostingInChat | null {
  // The first posting in a conversation is what this screen is for. Never
  // questioned.
  if (existing.length === 0) {
    return null;
  }

  if (!readsAsPosting(pending)) {
    return null;
  }

  const url = firstUrl(pending);
  const print = fingerprint(pending);

  for (const posting of existing) {
    if (url !== null && posting.jobUrl === url) {
      return null;
    }
    if (fingerprint(posting.jobDescription) === print) {
      return null;
    }
    // The link, then the description of the same job. A very common two-message
    // sequence, and flagging the second half of it would warn about the posting
    // the user is in the middle of supplying.
    if (posting.jobUrl !== null && pending.includes(posting.jobUrl)) {
      return null;
    }
  }

  return existing[existing.length - 1] ?? null;
}
