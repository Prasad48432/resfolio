import { portfolioMinimalConfigSchema } from "@resfolio/template-portfolio-minimal";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { describeConfigSchema } from "./config-form";

describe("describeConfigSchema", () => {
  it("describes the portfolio-minimal config from its schema", () => {
    const fields = describeConfigSchema(portfolioMinimalConfigSchema);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));

    // The templates are opinionated: config is content/visibility only, no
    // styling knobs (colors/layout are the template's own).
    expect(byKey.showAvatar).toMatchObject({
      kind: "boolean",
      defaultValue: true,
    });
    expect(byKey.featuredProjectCount).toMatchObject({
      kind: "number",
      min: 1,
      max: 12,
      defaultValue: 4,
    });
  });

  it("describes an enum as a select and a hex string as a color", () => {
    const fields = describeConfigSchema(
      z.object({
        mode: z.enum(["centered", "aside"]).default("aside"),
        tint: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#e0603a"),
      }),
    );
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.mode).toEqual({
      key: "mode",
      label: "Mode",
      kind: "select",
      options: ["centered", "aside"],
      defaultValue: "aside",
    });
    expect(byKey.tint).toMatchObject({ kind: "color", defaultValue: "#e0603a" });
  });

  it("humanizes camelCase keys into labels", () => {
    const fields = describeConfigSchema(
      z.object({ featuredProjectCount: z.number().default(4) }),
    );
    expect(fields[0]?.label).toBe("Featured project count");
  });

  it("treats a plain string as text, not a color", () => {
    const fields = describeConfigSchema(
      z.object({ tagline: z.string().default("hi") }),
    );
    expect(fields[0]).toMatchObject({ kind: "text", defaultValue: "hi" });
  });

  it("skips unsupported field shapes rather than guessing", () => {
    const fields = describeConfigSchema(
      z.object({
        keep: z.boolean().default(false),
        drop: z.array(z.string()).default([]),
      }),
    );
    expect(fields.map((f) => f.key)).toEqual(["keep"]);
  });

  it("derives exclusive number bounds correctly", () => {
    const fields = describeConfigSchema(
      z.object({ n: z.number().gt(0).lt(10).default(5) }),
    );
    expect(fields[0]).toMatchObject({ kind: "number", min: 1, max: 9 });
  });
});
