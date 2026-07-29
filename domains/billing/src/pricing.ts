import { z } from "zod";

import type { PlanId } from "./plans";
import type { PremiumProduct } from "./products";

/**
 * The price catalogue
 * (docs/architecture/14-ai-usage-and-billing.md §12).
 *
 * **India first, global-ready**, and those two requirements only coexist if
 * pricing is a table rather than a number.
 *
 * The property that makes it work: **`PLAN_LIMITS` is not keyed by currency.**
 * An Indian monthly subscriber and an American one get identical allowances.
 * Pricing varies; entitlement does not. Doing it the other way makes "which
 * plan am I on" a question with a geographic answer, and every usage screen and
 * support conversation inherits that.
 *
 * Nothing on the enforcement path reads this file. It answers two questions
 * only: what do we charge, and which Dodo product id does checkout send.
 */

export const CURRENCIES = ["INR", "USD"] as const;

export type Currency = (typeof CURRENCIES)[number];

export const currencySchema = z.enum(CURRENCIES);

/** The default when nothing better is known. India is the primary market. */
export const DEFAULT_CURRENCY: Currency = "INR";

export interface PriceRef {
  /**
   * Dodo's product id. **The client never sends one of these** — it sends a
   * plan or product *name* from a closed set, and the server resolves it here.
   * A client-supplied product id is a client-supplied price.
   */
  productId: string;
  /** Minor units (paise, cents). Integer arithmetic; never a float. */
  amountMinor: number;
  currency: Currency;
}

/** What can be bought (§12.1). */
export type Purchasable = PlanId | PremiumProduct;

/**
 * `Purchasable × Currency → PriceRef`.
 *
 * **Product ids are placeholders until the products exist in the Dodo
 * dashboard**, and prices are placeholders until §14.1 is decided. Deliberately
 * left obviously fake rather than plausibly wrong: a real-looking id that
 * resolves to nothing fails at checkout with a 404 from the provider, which is
 * a worse thing to debug than an empty string.
 *
 * `free` has no price and no product; it is present so the record is
 * exhaustive over `PlanId` and a missing plan cannot compile.
 */
export const PLAN_PRICING: Record<
  Purchasable,
  Partial<Record<Currency, PriceRef>>
> = {
  free: {},
  weekly: {},
  monthly: {},
  yearly: {},
  premium_resume_templates: {},
  premium_portfolio_templates: {},
};

/** Whether a plan renews by itself. The week pass is a **one-time payment**
 * (§4.1), which is why this is not simply "anything that isn't free". */
export function isRecurring(planId: PlanId): boolean {
  return planId === "monthly" || planId === "yearly";
}

/**
 * Look up what to charge. Returns `null` when the product is not sold in that
 * currency, which the caller must handle rather than falling back to another
 * currency — silently charging someone in the wrong one is worse than
 * refusing.
 */
export function priceFor(
  purchasable: Purchasable,
  currency: Currency,
): PriceRef | null {
  return PLAN_PRICING[purchasable][currency] ?? null;
}
