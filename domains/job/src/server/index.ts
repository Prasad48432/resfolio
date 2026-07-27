/**
 * @resfolio/job/server — database-backed job match operations
 * (docs/architecture/13-ai-layer.md, 07-storage.md). Kept separate from the
 * package root so the pure half (schemas, title derivation, the score view, the
 * confirmation threshold) can be imported into client components and tests
 * without pulling in the database client.
 */
export {
  JobMatchError,
  deleteJobMatch,
  getJobMatch,
  listJobMatches,
  listJobMatchesForChat,
  recordJobEnhancement,
  saveCoverLetter,
  saveJobMatch,
  setJobStatus,
} from "./repository";
