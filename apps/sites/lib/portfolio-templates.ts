import { darkAnime } from "@resfolio/template-dark-anime";
import type { PortfolioTemplateDefinition } from "@resfolio/template-sdk";

/**
 * The portfolio template registry (doc 03). A static map `templateId → package`
 * — no runtime `import()` of arbitrary strings — so Next can bundle and
 * code-split each template. Templates are opaque here: their config type is
 * erased to `unknown` and re-validated at render time with the template's own
 * `configSchema`, so the host stays generic over any registered portfolio
 * template.
 */
export type AnyPortfolioTemplate = PortfolioTemplateDefinition<unknown>;

// The contravariant page-renderer positions make the concrete→unknown widening
// unprovable to TS; the cast is sound because the host only ever feeds a page a
// config it parsed through this same template's schema.
const REGISTRY = new Map<string, AnyPortfolioTemplate>([
  [darkAnime.id, darkAnime as unknown as AnyPortfolioTemplate],
]);

export function getPortfolioTemplate(
  id: string,
): AnyPortfolioTemplate | undefined {
  return REGISTRY.get(id);
}
