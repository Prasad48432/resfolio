import { z } from "zod";

import {
  CANDIDATE_KINDS,
  type CandidateItem,
  type CandidateKind,
} from "./candidate";
import { ConnectorDefinitionError } from "./errors";

/**
 * The connector contract (docs/architecture/12-integrations-and-sync.md). Every
 * provider is one small module implementing exactly two functions — `fetch`
 * (the only place a provider API is touched) and `normalize` (**pure**: raw →
 * canonical candidates) — plus metadata declaring its auth mode. Everything
 * else (token refresh, retries, scheduling, staging, diffing, dedupe, media
 * rehosting, the review UI) is the runtime, written once. This is the single
 * biggest lever for "adding provider #19 is a small, boring task".
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
  /** Supports cursor/ETag incremental fetch (else the runtime full-refetches —
   * cheap and idempotent anyway thanks to fingerprints). */
  incremental: boolean;
  /** Provider offers cheap webhooks (an optimization, wired later — doc 12). */
  webhooks: boolean;
}

export interface ConnectorSchedule {
  /** Default refresh cadence (`"24h"`, `"7d"`, …). The runtime jitters this
   * per connection; public feeds can be lazier. */
  defaultEvery: string;
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
  schedule: ConnectorSchedule;
  /** The only place a provider API is touched — yields raw items, updates the
   * cursor via `ctx.setCursor`. */
  fetch: (ctx: FetchContext<Input>) => AsyncIterable<Raw>;
  /** Pure: raw item → zero or more canonical candidates (skip = `[]`). */
  normalize: (raw: Raw) => CandidateItem[];
}

/** Any connector, credentials/input/raw erased — the registry's element type. */
export type AnyConnector = Connector<unknown, unknown>;

const CONNECTOR_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DURATION = /^\d+(s|m|h|d|w)$/;

const metaSchema = z.object({
  id: z.string().regex(CONNECTOR_ID, "id must be kebab-case"),
  name: z.string().min(1),
  authMode: z.enum(AUTH_MODES),
  tier: z.enum(CONNECTOR_TIERS),
  resources: z
    .array(z.enum(CANDIDATE_KINDS))
    .min(1, "must declare at least one resource kind"),
  capabilities: z.object({
    incremental: z.boolean(),
    webhooks: z.boolean(),
  }),
  schedule: z.object({
    defaultEvery: z
      .string()
      .regex(DURATION, "schedule.defaultEvery must be a duration like 24h"),
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
    schedule: Object.freeze({ ...def.schedule }),
  }) as Connector<Input, Raw>;
}
