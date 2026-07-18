import {
  darkAnime,
  darkAnimeConfigSchema,
} from "@resfolio/template-dark-anime";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { describeConfigSchema, describeMissing } from "./config-form";

describe("describeConfigSchema", () => {
  it("describes the dark-anime config from its schema", () => {
    const fields = describeConfigSchema(darkAnimeConfigSchema);
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
      defaultValue: 6,
    });
  });

  it("merges the template's declared metadata over the inferred shape", () => {
    const fields = describeConfigSchema(darkAnimeConfigSchema, {
      configFields: darkAnime.configFields,
      requirements: darkAnime.requirements,
    });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));

    // Nothing about `z.union([z.literal(""), z.url()])` says "banner image" or
    // "1200×260" — only the template knows, which is why metadata exists.
    expect(byKey.bannerImage).toMatchObject({
      kind: "image",
      label: "Banner image",
      required: true,
      image: { width: 1200, height: 260 },
    });
    expect(byKey.quote).toMatchObject({ kind: "textarea" });
    // Not declared required → no flag, not `required: false`.
    expect(byKey.quote?.required).toBeUndefined();
  });

  it("without metadata, infers only what the schema can prove", () => {
    const fields = describeConfigSchema(darkAnimeConfigSchema);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    // A bare union of "" | url is unknowable — skipped, never guessed.
    expect(byKey.bannerImage).toBeUndefined();
    expect(byKey.quote).toMatchObject({ kind: "text" });
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
    expect(byKey.tint).toMatchObject({
      kind: "color",
      defaultValue: "#e0603a",
    });
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

describe("describeMissing", () => {
  const fields = describeConfigSchema(darkAnimeConfigSchema, {
    configFields: darkAnime.configFields,
    requirements: darkAnime.requirements,
  });

  it("labels a config gap with the form's own label, so the two agree", () => {
    expect(
      describeMissing({ scope: "config", key: "bannerImage" }, fields),
    ).toEqual({ label: "Banner image", where: "settings" });
  });

  it("labels a profile gap in plain English and points at /profile", () => {
    expect(
      describeMissing({ scope: "profile", key: "sections.projects" }, fields),
    ).toEqual({ label: "At least one project", where: "profile" });
  });
});
