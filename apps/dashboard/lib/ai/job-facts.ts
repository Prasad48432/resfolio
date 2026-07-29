import type { JobMatchSummary, JobStatus } from "@resfolio/job";

/**
 * What a match card in the transcript needs to know about the job it produced.
 *
 * **The transcript records what was suggested; it can never record what was
 * done.** A tool result is frozen the moment it is written, so a card rendered
 * from history has no memory of the enhancement it caused, the resume it was
 * pointed at, or the application that came out of it. Those facts live on the
 * job row, and this is the shape they travel in from
 * `AiWorkspace → AiChat → AiMessage → JobMatchCard`.
 *
 * It replaced a `Set<string>` of enhanced job ids, which answered exactly one of
 * these three questions — and the other two were the reason the optimise card
 * kept offering work it had already done.
 */
export interface JobFacts {
  /** This posting has already caused accepted profile changes. */
  hasEnhancement: boolean;
  /** The resume already pointed at this posting, if any. Not a boolean: the
   * question the card asks is whether *this* resume is spent, and a second
   * resume is still a real thing to tailor. */
  resumeDocumentId: string | null;
  /** Where it sits in the tracker. `saved` is what makes the "did you apply?"
   * prompt worth showing; anything else means the question is answered. */
  status: JobStatus;
}

/**
 * Index a job list by id.
 *
 * A map rather than a lookup through the array because every message in a long
 * transcript reads it, and rebuilt from the list the panel already refreshes so
 * that a card's state follows an enhancement applied seconds ago — not only one
 * applied before the page loaded.
 */
export function buildJobFacts(
  jobs: readonly JobMatchSummary[],
): ReadonlyMap<string, JobFacts> {
  return new Map(
    jobs.map((job) => [
      job.id,
      {
        hasEnhancement: job.hasEnhancement,
        resumeDocumentId: job.resumeDocumentId,
        status: job.status,
      },
    ]),
  );
}
