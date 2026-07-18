import type {
  CandidateItem,
  CandidateKind,
  CandidateRoute,
  RouteTarget,
} from "./candidate";
import { CandidateApplyError } from "./errors";

/**
 * The routing policy (docs/architecture/12-integrations-and-sync.md — Route is
 * a named pipeline stage). Every candidate resolves to a route in three
 * override layers: a per-kind default (here), an optional connector
 * declaration on the candidate (`candidate.route` — e.g. a provider bio →
 * basics as `suggested`), and finally the user at import time
 * (`importItem(..., { routeTo })`). Import validates payload ↔ section
 * compatibility, so a mis-route can never produce an invalid profile.
 *
 * `sectionKey: null` = **unrouted** — the candidate stays in the Sources
 * workspace ("needs a home") until the user routes or dismisses it. Nothing
 * is silently dropped.
 */

/** Where each kind lands by default. `unclassified` deliberately has no
 * destination. `profileLink` is `certain`: a provider knows its own profile
 * URL as a fact, not a guess — unlike identity, which no connector may
 * propose at all (see `candidate.ts`). */
export const DEFAULT_ROUTE_FOR_KIND: Record<CandidateKind, CandidateRoute> = {
  project: { sectionKey: "projects", confidence: "certain" },
  contribution: { sectionKey: "projects", confidence: "certain" },
  article: { sectionKey: "writing", confidence: "certain" },
  talk: { sectionKey: "custom", confidence: "certain" },
  experience: { sectionKey: "experience", confidence: "certain" },
  education: { sectionKey: "education", confidence: "certain" },
  skillGroup: { sectionKey: "skills", confidence: "certain" },
  certification: { sectionKey: "certifications", confidence: "certain" },
  profileLink: { sectionKey: "links", confidence: "certain" },
  unclassified: { sectionKey: null, confidence: "suggested" },
};

/**
 * The destinations each payload shape can validly land in — what the user's
 * import-time override may pick from. V1 keeps typed kinds 1:1 with their
 * canonical section; `unclassified` maps onto a custom section (the typed-
 * section field-mapping step is a doc-12 open question, decided in the
 * workspace UI phase).
 */
export const COMPATIBLE_ROUTE_TARGETS: Record<
  CandidateKind,
  readonly RouteTarget[]
> = {
  project: ["projects"],
  contribution: ["projects"],
  article: ["writing"],
  talk: ["custom"],
  experience: ["experience"],
  education: ["education"],
  skillGroup: ["skills"],
  certification: ["certifications"],
  profileLink: ["links"],
  unclassified: ["custom"],
};

export function isRouteCompatible(
  kind: CandidateKind,
  target: RouteTarget,
): boolean {
  return COMPATIBLE_ROUTE_TARGETS[kind].includes(target);
}

/** Guard a user (or connector) route override before applying it. */
export function assertRouteTarget(
  kind: CandidateKind,
  target: RouteTarget,
): void {
  if (!isRouteCompatible(kind, target)) {
    throw new CandidateApplyError(
      `A "${kind}" item cannot be routed to "${target}".`,
    );
  }
}

/**
 * The route a candidate stages with: the connector's declaration when it is
 * valid for the kind, else the kind's default. An incompatible connector
 * declaration is sanitized to **unrouted** (never guessed into a section) —
 * the workspace will ask the user.
 */
export function resolveRoute(candidate: CandidateItem): CandidateRoute {
  const declared = candidate.route;
  if (!declared) {
    return DEFAULT_ROUTE_FOR_KIND[candidate.kind];
  }
  if (
    declared.sectionKey !== null &&
    !isRouteCompatible(candidate.kind, declared.sectionKey)
  ) {
    return { sectionKey: null, confidence: "suggested" };
  }
  return declared;
}
