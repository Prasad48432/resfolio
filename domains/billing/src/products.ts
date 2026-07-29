import { z } from "zod";

/**
 * Non-consumable, never-expiring purchases
 * (docs/architecture/14-ai-usage-and-billing.md §4.5).
 */

/**
 * Premium templates, sold **per kind** and **permanently**.
 *
 * Permanence is not a simplification — it follows from what a template is
 * attached to. A portfolio at `/p/<handle>` is a link on someone's CV and in
 * applications already sent. Subscription-gating it forces a choice between
 * revoking (a paying customer's public site changes or 404s on the day their
 * card expires) and not really gating anything. A permanent unlock means that
 * choice never has to be made. **Anything that renders at a URL a stranger may
 * hold should be sold once, not rented.**
 *
 * **Two products rather than one combined unlock**, because the two have
 * different buyers on different timelines: a resume template is bought by
 * someone applying for jobs, in the week they are applying; a portfolio
 * template by someone building a public presence, which is a different activity
 * and often not happening at all. Bundling prices the larger and more urgent
 * segment for something they did not come for.
 *
 * The entitlement is **per kind, not per template** — "all current and future"
 * is the promise, which is what makes a one-time price defensible to the buyer
 * and a real constraint on the business. If that becomes untenable the escape
 * is a *new* product id, never a retroactive narrowing of one already sold.
 */
export const PREMIUM_PRODUCTS = [
  "premium_resume_templates",
  "premium_portfolio_templates",
] as const;

export type PremiumProduct = (typeof PREMIUM_PRODUCTS)[number];

export const premiumProductSchema = z.enum(PREMIUM_PRODUCTS);

export const PREMIUM_PRODUCT_LABELS: Record<PremiumProduct, string> = {
  premium_resume_templates: "Premium resume templates",
  premium_portfolio_templates: "Premium portfolio templates",
};

/**
 * How an entitlement was obtained. Not decoration: a plan-granted unlock and a
 * purchased one are different facts even though they grant the same thing.
 *
 * A `purchase` is permanent by the argument above. A `plan` grant is created
 * when a yearly subscription activates — and when that subscription lapses the
 * row is **left alone rather than revoked**, for exactly the same reason.
 *
 * That is a deliberate giveaway: someone can buy one year, publish a premium
 * portfolio, and keep the template. It is accepted because the defence against
 * it is a mechanism that breaks live sites. Recording the source is what makes
 * the giveaway **measurable** rather than invisible, and therefore revisitable
 * with data instead of instinct.
 */
export const ENTITLEMENT_SOURCES = ["purchase", "plan", "comp"] as const;

export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number];

export const entitlementSourceSchema = z.enum(ENTITLEMENT_SOURCES);

/** Which unlocks a plan grants on activation. Only `yearly` grants any. */
export const PLAN_GRANTED_PRODUCTS: Readonly<
  Record<string, readonly PremiumProduct[]>
> = {
  free: [],
  weekly: [],
  monthly: [],
  yearly: PREMIUM_PRODUCTS,
};
