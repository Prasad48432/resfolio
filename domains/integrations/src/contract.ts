import { z } from "zod";

import {
  CANDIDATE_KINDS,
  type CandidateItem,
  type CandidateKind,
} from "./candidate";
import { ConnectorDefinitionError } from "./errors";

/**
 * The connector contract (docs/architecture/12-integrations-and-sync.md). Every
 * provider is one small module implementing two functions — `fetch`
 * (the only place a provider API is touched) and `normalize` (**pure**: raw →
 * canonical candidates) — plus an optional third, `profileLinks` (**pure**:
 * connection input → the provider's own profile link, no fetch at all) — plus
 * metadata declaring its auth mode and whether
 * it is `refreshable`. Everything else (token handling, retries, staging,
 * routing defaults, dedupe, media rehosting, the workspace UI) is the
 * runtime, written once. This is the single biggest lever for "adding
 * provider #19 is a small, boring task".
 *
 * The root is pure: `fetch` receives a pre-authenticated, rate-limited `fetch`
 * from the runtime via `FetchContext` and never handles credentials itself
 * (tokens are decrypted only inside the runtime, never near connector code —
 * doc 12 / doc 10). Defining `FetchContext` here locks the shape the runtime
 * must provide, so building the runtime next needs no contract change.
 */

export const AUTH_MODES = ["oauth2", "token", "public", "file"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

/** Honest-expectations tier (doc 12): A = API-backed, B = feed/page best-effort
 * (may `degrade`), C = no viable live integration (file import at best). */
export const CONNECTOR_TIERS = ["A", "B", "C"] as const;
export type ConnectorTier = (typeof CONNECTOR_TIERS)[number];

/** oauth2/token connectors declare the read-only scopes they need. */
export interface ConnectorAuth {
  scopes: readonly string[];
}

export interface ConnectorCapabilities {
  /** May offer "Check for updates" — a user-initiated re-fetch that can
   * surface `refresh_available` badges (doc 12, optional refresh). One-shot
   * providers (file imports) declare `false` and skip every piece of refresh
   * machinery by construction. */
  refreshable: boolean;
  /** Supports cursor/ETag incremental fetch (else the runtime full-refetches —
   * cheap and idempotent anyway thanks to fingerprints). */
  incremental: boolean;
}

/**
 * The runtime seam handed to `fetch`. The `fetch` here is pre-authenticated
 * (tokens injected as headers by the runtime) and rate-limited (blocks on the
 * per-provider app budget *and* per-connection courtesy limit), so a connector
 * physically cannot bypass either. Connectors must use **only** this fetch.
 */
export interface FetchContext<Input = unknown> {
  fetch: typeof fetch;
  /** The connection's validated input — `public`/`file` connectors' username,
   * feed URL, etc.; `undefined` for oauth2/token. */
  input: Input;
  /** Opaque incremental cursor from the previous run (page, ETag, timestamp),
   * or `undefined` on first sync. */
  cursor: string | undefined;
  /** Persist the cursor for the next incremental run. */
  setCursor: (cursor: string) => void;
  /** Cooperative cancellation (run timeout / shutdown). */
  signal?: AbortSignal;
}

/**
 * A provider connector. Generic over its `Input` (public/file connectors) and
 * its `Raw` item type (so a connector's own `fetch`/`normalize` stay precisely
 * typed while the registry erases both to `unknown`).
 */
export interface Connector<Input = unknown, Raw = unknown> {
  id: string;
  name: string;
  authMode: AuthMode;
  tier: ConnectorTier;
  /** oauth2/token only. */
  auth?: ConnectorAuth;
  /** Required input schema for `public`/`file` connectors (validated before a
   * connection is stored); `undefined` for oauth2/token. */
  input?: z.ZodType<Input>;
  /** Canonical kinds this connector emits. */
  resources: readonly CandidateKind[];
  capabilities: ConnectorCapabilities;
  /** The only place a provider API is touched — yields raw items, updates the
   * cursor via `ctx.setCursor`. */
  fetch: (ctx: FetchContext<Input>) => AsyncIterable<Raw>;
  /** Pure: raw item → zero or more canonical candidates (skip = `[]`). */
  normalize: (raw: Raw) => CandidateItem[];
  /**
   * Pure: the connector's own profile link(s), derived from the connection
   * `input` alone — **no fetch**. `https://github.com/{username}` is knowable
   * the moment the user types the username; spending an API call to learn it
   * would be silly, and `normalize` couldn't do it anyway (it sees only a raw
   * item, and a user with zero repos yields no raw items at all).
   *
   * Omit when the input implies no profile: an RSS feed URL is a publication,
   * not a person. Results are staged and triaged like any other candidate —
   * this is a *proposal*, never a write.
   */
  profileLinks?: (input: Input) => CandidateItem[];
}

/** Any connector, credentials/input/raw erased — the registry's element type. */
export type AnyConnector = Connector<unknown, unknown>;

const CONNECTOR_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const metaSchema = z.object({
  id: z.string().regex(CONNECTOR_ID, "id must be kebab-case"),
  name: z.string().min(1),
  authMode: z.enum(AUTH_MODES),
  tier: z.enum(CONNECTOR_TIERS),
  resources: z
    .array(z.enum(CANDIDATE_KINDS))
    .min(1, "must declare at least one resource kind"),
  capabilities: z.object({
    refreshable: z.boolean(),
    incremental: z.boolean(),
  }),
});

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

/**
 * Validate and freeze a connector definition. Called at module load by every
 * connector; throws `ConnectorDefinitionError` on any contract violation so a
 * broken connector fails loudly at registration, never mid-sync (mirrors the
 * template SDK's `defineTemplate`).
 */
export function defineConnector<Input, Raw>(
  def: Connector<Input, Raw>,
): Connector<Input, Raw> {
  const id = typeof def?.id === "string" ? def.id : "<unknown>";

  const meta = metaSchema.safeParse(def);
  if (!meta.success) {
    throw new ConnectorDefinitionError(id, formatIssues(meta.error));
  }

  if (typeof def.fetch !== "function") {
    throw new ConnectorDefinitionError(id, "fetch must be a function");
  }
  if (typeof def.normalize !== "function") {
    throw new ConnectorDefinitionError(id, "normalize must be a function");
  }
  if (
    def.profileLinks !== undefined &&
    typeof def.profileLinks !== "function"
  ) {
    throw new ConnectorDefinitionError(
      id,
      "profileLinks must be a function when declared",
    );
  }
  // A connector that emits links must say so, like any other kind — `resources`
  // is what the workspace reads to describe a connector before it ever runs.
  if (def.profileLinks && !def.resources.includes("profileLink")) {
    throw new ConnectorDefinitionError(
      id,
      "declares profileLinks but does not list `profileLink` in resources",
    );
  }

  // oauth2/token need read scopes; public/file need an input schema to validate
  // the connection before storing it (doc 12 — auth mode is the load-bearing
  // per-provider declaration).
  if (def.authMode === "oauth2" || def.authMode === "token") {
    if (!def.auth || def.auth.scopes.length === 0) {
      throw new ConnectorDefinitionError(
        id,
        `${def.authMode} connectors must declare auth.scopes`,
      );
    }
  }
  if (def.authMode === "public" || def.authMode === "file") {
    if (
      !def.input ||
      typeof (def.input as { safeParse?: unknown }).safeParse !== "function"
    ) {
      throw new ConnectorDefinitionError(
        id,
        `${def.authMode} connectors must declare an input Zod schema`,
      );
    }
  }

  return Object.freeze({
    ...def,
    resources: Object.freeze([...def.resources]),
    capabilities: Object.freeze({ ...def.capabilities }),
  }) as Connector<Input, Raw>;
}
