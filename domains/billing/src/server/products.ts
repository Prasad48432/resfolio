import { and, eq } from "drizzle-orm";

import { db, schema } from "@resfolio/database";

import { type PremiumProduct, premiumProductSchema } from "../products";

/**
 * Premium template entitlements
 * (docs/architecture/14-ai-usage-and-billing.md §4.5, §5.4).
 * **The only code that reads `product_entitlements`.**
 *
 * **These are checked on write, never on render.** The dashboard calls them
 * when a template is *selected* and again when a site is *published*;
 * `apps/sites` never does. It has no sessions by design, and putting a billing
 * lookup on the public render path would mean a query on every ISR miss and
 * would make a refund capable of taking down a live site.
 */

/** Whether this user may select templates of the given kind. */
export async function hasProductEntitlement(
  userId: string,
  product: PremiumProduct,
): Promise<boolean> {
  const row = await db.query.productEntitlement.findFirst({
    where: and(
      eq(schema.productEntitlement.userId, userId),
      eq(schema.productEntitlement.product, product),
      // `revoked` blocks new selections. It deliberately has no effect on
      // anything already published — see §4.5.
      eq(schema.productEntitlement.status, "active"),
    ),
    columns: { product: true },
  });

  return Boolean(row);
}

/**
 * Every unlock this user holds — one query, for a page that needs to know
 * about both kinds at once.
 */
export async function listProductEntitlements(
  userId: string,
): Promise<PremiumProduct[]> {
  const rows = await db
    .select({ product: schema.productEntitlement.product })
    .from(schema.productEntitlement)
    .where(
      and(
        eq(schema.productEntitlement.userId, userId),
        eq(schema.productEntitlement.status, "active"),
      ),
    );

  // The column is `text` so the catalogue can grow; a product this deploy does
  // not recognise is ignored rather than crashing a settings page.
  return rows.flatMap((row) => {
    const parsed = premiumProductSchema.safeParse(row.product);
    return parsed.success ? [parsed.data] : [];
  });
}
