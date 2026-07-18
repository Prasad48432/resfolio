import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type CandidateItem } from "./candidate";
import { defineConnector, type Connector, type FetchContext } from "./contract";
import { ConnectorDefinitionError } from "./errors";

/** An empty async iterable — a stub fetch for definition-shape tests. */
const noItems: AsyncIterable<unknown> = {
  [Symbol.asyncIterator]() {
    return {
      next: () => Promise.resolve({ value: undefined, done: true as const }),
    };
  },
};

function makeValid(): Connector<{ username: string }, unknown> {
  return {
    id: "example",
    name: "Example",
    authMode: "public",
    tier: "A",
    input: z.object({ username: z.string() }),
    resources: ["project"],
    capabilities: { refreshable: true, incremental: false },
    fetch: (ctx: FetchContext<{ username: string }>) => {
      void ctx;
      return noItems;
    },
    normalize: (): CandidateItem[] => [],
  };
}

describe("defineConnector", () => {
  it("accepts a valid connector and freezes it", () => {
    const connector = defineConnector(makeValid());
    expect(connector.id).toBe("example");
    expect(Object.isFrozen(connector)).toBe(true);
    expect(Object.isFrozen(connector.capabilities)).toBe(true);
    expect(Object.isFrozen(connector.resources)).toBe(true);
  });

  it("rejects a non-kebab id", () => {
    expect(() => defineConnector({ ...makeValid(), id: "Not_Kebab" })).toThrow(
      ConnectorDefinitionError,
    );
  });

  it("rejects an empty resources list", () => {
    expect(() => defineConnector({ ...makeValid(), resources: [] })).toThrow(
      /at least one resource/,
    );
  });

  it("requires the refreshable capability declaration", () => {
    expect(() =>
      defineConnector({
        ...makeValid(),
        capabilities: { incremental: false } as unknown as {
          refreshable: boolean;
          incremental: boolean;
        },
      }),
    ).toThrow(ConnectorDefinitionError);
  });

  it("requires auth.scopes for oauth2/token connectors", () => {
    expect(() =>
      defineConnector({
        ...makeValid(),
        authMode: "oauth2",
        auth: undefined,
        input: undefined,
      }),
    ).toThrow(/auth\.scopes/);
  });

  it("requires an input schema for public/file connectors", () => {
    expect(() => defineConnector({ ...makeValid(), input: undefined })).toThrow(
      /input Zod schema/,
    );
  });

  it("rejects a missing normalize function", () => {
    expect(() =>
      defineConnector({
        ...makeValid(),
        normalize: undefined as unknown as (raw: unknown) => CandidateItem[],
      }),
    ).toThrow(/normalize/);
  });
});
