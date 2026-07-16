import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineTemplate } from "./define-template";
import { TemplateDefinitionError } from "./errors";
import type {
  PortfolioTemplateDefinition,
  ResumeTemplateDefinition,
} from "./types";

const configSchema = z.object({
  pageSize: z.enum(["A4", "LETTER"]).default("A4"),
});
type Config = z.infer<typeof configSchema>;

function baseDefinition(): ResumeTemplateDefinition<Config> {
  return {
    kind: "resume",
    id: "resume-test",
    version: "1.0.0",
    compat: { profileView: 1, sdk: 1 },
    name: "Test",
    description: "A test template.",
    configSchema,
    defaultConfig: { pageSize: "A4" },
    themes: [{ id: "paper", tokens: { "--rf-accent": "#000" } }],
    customizableTokens: ["--rf-accent"],
    capabilities: { atsSafe: true, pageSizes: ["A4", "LETTER"] },
    document: () => null,
  };
}

describe("defineTemplate", () => {
  it("accepts and freezes a valid definition", () => {
    const template = defineTemplate(baseDefinition());
    expect(template.id).toBe("resume-test");
    expect(Object.isFrozen(template)).toBe(true);
    expect(Object.isFrozen(template.themes)).toBe(true);
    expect(Object.isFrozen(template.capabilities)).toBe(true);
  });

  it("rejects a non-semver version", () => {
    expect(() =>
      defineTemplate({ ...baseDefinition(), version: "1.0" }),
    ).toThrow(TemplateDefinitionError);
  });

  it("rejects a non-kebab-case id", () => {
    expect(() =>
      defineTemplate({ ...baseDefinition(), id: "Resume_Test" }),
    ).toThrow(/kebab-case/);
  });

  it("rejects a defaultConfig that fails its own configSchema", () => {
    expect(() =>
      defineTemplate({
        ...baseDefinition(),
        defaultConfig: { pageSize: "A3" } as unknown as Config,
      }),
    ).toThrow(/defaultConfig is invalid/);
  });

  it("rejects a compat.profileView the SDK cannot build", () => {
    expect(() =>
      defineTemplate({
        ...baseDefinition(),
        compat: { profileView: 2, sdk: 1 },
      }),
    ).toThrow(/ProfileView v2/);
  });

  it("rejects a customizable token missing from a theme preset", () => {
    expect(() =>
      defineTemplate({
        ...baseDefinition(),
        customizableTokens: ["--rf-accent", "--rf-font-body"],
      }),
    ).toThrow(/--rf-font-body is missing/);
  });

  it("rejects a malformed theme token name", () => {
    expect(() =>
      defineTemplate({
        ...baseDefinition(),
        // Cast past the compile-time `--rf-*` guard to exercise the *runtime*
        // token-name validation in defineTemplate.
        themes: [{ id: "paper", tokens: { "--accent": "#000" } as never }],
      }),
    ).toThrow(TemplateDefinitionError);
  });

  it("requires at least one theme", () => {
    expect(() => defineTemplate({ ...baseDefinition(), themes: [] })).toThrow(
      /at least one theme/,
    );
  });
});

const portfolioConfigSchema = z.object({
  heroStyle: z.enum(["centered", "split"]).default("centered"),
});
type PortfolioConfig = z.infer<typeof portfolioConfigSchema>;

function basePortfolioDefinition(): PortfolioTemplateDefinition<PortfolioConfig> {
  return {
    kind: "portfolio",
    id: "portfolio-test",
    version: "1.0.0",
    compat: { profileView: 1, sdk: 1 },
    name: "Test Portfolio",
    description: "A test portfolio template.",
    configSchema: portfolioConfigSchema,
    defaultConfig: { heroStyle: "centered" },
    themes: [{ id: "midnight", tokens: { "--rf-accent": "#fff" } }],
    customizableTokens: ["--rf-accent"],
    capabilities: { pages: ["home", "projects", "projectDetail"] },
    pages: {
      home: () => null,
      projects: () => null,
      projectDetail: () => null,
    },
  };
}

describe("defineTemplate — portfolio kind", () => {
  it("accepts and freezes a valid portfolio definition", () => {
    const template = defineTemplate(basePortfolioDefinition());
    expect(template.kind).toBe("portfolio");
    expect(template.id).toBe("portfolio-test");
    expect(Object.isFrozen(template)).toBe(true);
    expect(Object.isFrozen(template.pages)).toBe(true);
    expect(Object.isFrozen(template.capabilities)).toBe(true);
    expect(template.capabilities.pages).toContain("home");
  });

  it("rejects a portfolio that does not declare a home page", () => {
    const def = basePortfolioDefinition();
    expect(() =>
      defineTemplate({
        ...def,
        capabilities: { pages: ["projects", "projectDetail"] },
        pages: { projects: () => null, projectDetail: () => null },
      }),
    ).toThrow(/home/);
  });

  it("rejects a declared page with no renderer", () => {
    const def = basePortfolioDefinition();
    expect(() =>
      defineTemplate({
        ...def,
        capabilities: { pages: ["home", "about"] },
        pages: { home: () => null },
      }),
    ).toThrow(/"about" is declared/);
  });

  it("rejects a renderer for an undeclared page", () => {
    const def = basePortfolioDefinition();
    expect(() =>
      defineTemplate({
        ...def,
        capabilities: { pages: ["home"] },
        pages: { home: () => null, about: () => null },
      }),
    ).toThrow(/"about" has a renderer/);
  });

  it("rejects an empty pages capability", () => {
    const def = basePortfolioDefinition();
    expect(() =>
      defineTemplate({
        ...def,
        capabilities: { pages: [] },
        pages: {},
      }),
    ).toThrow(TemplateDefinitionError);
  });
});
