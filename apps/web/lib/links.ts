/**
 * External destinations the marketing site links out to.
 *
 * The dashboard is a separate deployment (apps/dashboard). Kept as a single
 * constant so every "Get started" CTA changes in one place — swap for the
 * custom domain (app.resfolio.me) at launch. Claim/handle query params can be
 * appended later; today every CTA lands on the dashboard root.
 */
export const DASHBOARD_URL = "https://resfolio-dashboard.vercel.app";
