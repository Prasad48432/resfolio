import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineTemplate } from "./define-template";
import { TemplateThemeError } from "./errors";
import { resolveTheme } from "./theme";
import type { ResumeTemplateDefinition } from "./types";

const template: ResumeTemplateDefinition<{ pageSize: "A4" | "LETTER" }> =
  defineTemplate({
    kind: "resume",
    id: "resume-theme",
    version: "1.0.0",
    compat: { profileView: 1, sdk: 1 },
    name: "Theme Test",
    description: "…",
    configSchema: z.object({ pageSize: z.enum(["A4", "LETTER"]) }),
    defaultConfig: { pageSize: "A4" },
    themes: [
      { id: "paper", tokens: { "--rf-accent": "#f0592b", "--rf-ink": "#111" } },
      {
        id: "slate",
        tokens: { "--rf-accent": "#2563eb", "--rf-ink": "#0b1220" },
      },
    ],
    customizableTokens: ["--rf-accent"],
    capabilities: { atsSafe: true, pageSizes: ["A4"] },
    document: () => null,
  });

describe("resolveTheme", () => {
  it("defaults to the first preset", () => {
    expect(resolveTheme(template)["--rf-accent"]).toBe("#f0592b");
  });

  it("selects a preset by id", () => {
    expect(resolveTheme(template, { themeId: "slate" })["--rf-accent"]).toBe(
      "#2563eb",
    );
  });

  it("applies overrides for customizable tokens", () => {
    const resolved = resolveTheme(template, {
      overrides: { "--rf-accent": "#16a34a" },
    });
    expect(resolved["--rf-accent"]).toBe("#16a34a");
  });

  it("ignores overrides for non-customizable tokens", () => {
    const resolved = resolveTheme(template, {
      overrides: { "--rf-ink": "#ffffff" },
    });
    expect(resolved["--rf-ink"]).toBe("#111");
  });

  it("throws on an unknown preset id", () => {
    expect(() => resolveTheme(template, { themeId: "nope" })).toThrow(
      TemplateThemeError,
    );
  });
});
