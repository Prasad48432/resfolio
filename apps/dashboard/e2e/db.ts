/* eslint-disable no-restricted-properties --
   test tooling runs outside the app; see playwright.config.ts */
import { Client } from "pg";

/** Same fallback as playwright.config.ts (docker-compose host port 15432). */
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://resfolio:resfolio@localhost:15432/resfolio";

/** Run one query against the e2e database (opens/closes its own client). */
export async function queryDb(
  text: string,
  values: unknown[] = [],
): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

/**
 * Server-side session revocation for the stale-cookie journey: deletes the
 * user's session rows directly, simulating "sign out everywhere" from
 * another device or a dev database reset — the browser keeps its cookie.
 */
export async function revokeAllSessions(email: string): Promise<void> {
  await queryDb(
    `DELETE FROM "session"
      WHERE "user_id" IN (SELECT "id" FROM "user" WHERE "email" = $1)`,
    [email],
  );
}
