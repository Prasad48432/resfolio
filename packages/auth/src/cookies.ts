/**
 * Edge-safe subpath (`@resfolio/auth/cookies`) for the dashboard proxy's
 * optimistic redirect: checks cookie *presence* only — never trusted as
 * verification, which the (dashboard) layout and every action do
 * server-side (docs/architecture/10-auth-and-security.md, route guarding).
 *
 * Kept separate from the package root so middleware never pulls in the
 * database client.
 */
export { getSessionCookie } from "better-auth/cookies";
