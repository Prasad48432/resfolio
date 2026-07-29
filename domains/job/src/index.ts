/**
 * `@resfolio/job` — job match sessions, which are the Application Tracker's rows.
 *
 * Pure root: schemas, types, ceilings and derived-value helpers. No database
 * import, so this is safe in a client component and in a test. The only code
 * that touches `job_match_sessions` is `./server`.
 *
 * See `CLAUDE.md` in this package for what belongs here and what does not.
 */
export * from "./match";
export * from "./flow";
