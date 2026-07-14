/**
 * @resfolio/database — Drizzle client + schema over Postgres, the system of
 * record (docs/architecture/07-storage.md). Consumed by domains and the
 * Better Auth setup only; apps never query it directly.
 */
export { db, type Database } from "./client";
export * as schema from "./schema";
