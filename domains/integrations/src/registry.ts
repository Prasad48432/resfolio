import { devto } from "./connectors/devto";
import { github } from "./connectors/github";
import { rss } from "./connectors/rss";
import { stackoverflow } from "./connectors/stackoverflow";
import type { AnyConnector } from "./contract";

/**
 * The static connector registry (docs/architecture/12-integrations-and-sync.md)
 * — same pattern as the template registry (code + PR + deploy, not runtime-
 * pluggable): while every connector is first-party, a typed contract + recorded
 * fixtures are worth more than hot-loading.
 *
 * The map erases each connector's `Input`/`Raw` generics to `unknown` — a
 * connector is only ever driven by the runtime, which re-validates the
 * connection input with `connector.input` and hands each connector its own raw
 * type. The `as unknown as` bridges that erasure at the one boundary where it
 * happens.
 */

/**
 * The V1 provider set: GitHub, Dev.to, RSS, Stack Overflow — all `public`,
 * none requiring OAuth, an app registration, or a user grant. Further
 * providers are evaluated individually on the availability and quality of
 * their public API before they are built.
 */
export const CONNECTOR_IDS = [
  "github",
  "rss",
  "devto",
  "stackoverflow",
] as const;

export type ConnectorId = (typeof CONNECTOR_IDS)[number];

export const CONNECTORS: Record<ConnectorId, AnyConnector> = {
  github: github as unknown as AnyConnector,
  rss: rss as unknown as AnyConnector,
  devto: devto as unknown as AnyConnector,
  stackoverflow: stackoverflow as unknown as AnyConnector,
};

/** The connector for `id`, or undefined for an unknown provider. */
export function getConnector(id: string): AnyConnector | undefined {
  return Object.prototype.hasOwnProperty.call(CONNECTORS, id)
    ? CONNECTORS[id as ConnectorId]
    : undefined;
}

/** Every registered connector, in declaration order. */
export function listConnectors(): AnyConnector[] {
  return CONNECTOR_IDS.map((id) => CONNECTORS[id]);
}
