import { SECTION_KEYS } from "@resfolio/profile";
import { z } from "zod";

import { TemplateDefinitionError } from "./errors";
import {
  PROFILE_VIEW_VERSION,
  PORTFOLIO_PAGE_KINDS,
  SDK_VERSION,
  type TemplateDefinition,
  type ThemePreset,
} from "./types";

/** Loose semver (major.minor.patch with an optional prerelease tag). */
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const TOKEN_NAME = /^--rf-[a-z0-9-]+$/;
const TEMPLATE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Identity/config/theme fields shared by every kind (everything except the
 * Zod config schema and the renderer(s), which are checked separately). */
const baseMetaShape = {
  id: z.string().regex(TEMPLATE_ID, "must be kebab-case"),
  version: z.string().regex(SEMVER, "must be semver (x.y.z)"),
  compat: z.object({
    profileView: z.number().int().positive(),
    sdk: z.number().int().positive(),
  }),
  name: z.string().min(1),
  description: z.string().min(1),
  preview: z.string().min(1).optional(),
  themes: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).optional(),
        tokens: z.record(z.string().regex(TOKEN_NAME), z.string()),
      }),
    )
    .min(1, "a template must ship at least one theme"),
  customizableTokens: z.array(z.string().regex(TOKEN_NAME)).optional(),
};

/** Validates the data half of a definition, discriminated on `kind` so each
 * kind's `capabilities` shape is checked precisely. */
const metaSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("resume"),
    ...baseMetaShape,
    capabilities: z.object({
      atsSafe: z.boolean(),
      pageSizes: z.array(z.enum(["A4", "LETTER"])).min(1),
    }),
  }),
  z.object({
    kind: z.literal("portfolio"),
    ...baseMetaShape,
    capabilities: z.object({
      pages: z
        .array(z.enum(PORTFOLIO_PAGE_KINDS))
        .min(1, "a portfolio template must declare at least one page"),
    }),
  }),
]);

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

function freezePreset(preset: ThemePreset): ThemePreset {
  return Object.freeze({
    ...preset,
    tokens: Object.freeze({ ...preset.tokens }),
  });
}

/**
 * Validate and freeze a template definition (docs/architecture/05-template-sdk.md).
 * Called at module load by every template; throws `TemplateDefinitionError`
 * on any contract violation so a broken template fails loudly in CI rather
 * than rendering garbage at request time. Overloaded per kind so the concrete
 * definition type flows through unchanged.
 */
export function defineTemplate<Config>(
  def: Extract<TemplateDefinition<Config>, { kind: "resume" }>,
): Extract<TemplateDefinition<Config>, { kind: "resume" }>;
export function defineTemplate<Config>(
  def: Extract<TemplateDefinition<Config>, { kind: "portfolio" }>,
): Extract<TemplateDefinition<Config>, { kind: "portfolio" }>;
export function defineTemplate<Config>(
  def: TemplateDefinition<Config>,
): TemplateDefinition<Config> {
  const id = typeof def?.id === "string" ? def.id : "<unknown>";

  const meta = metaSchema.safeParse(def);
  if (!meta.success) {
    throw new TemplateDefinitionError(id, formatIssues(meta.error));
  }

  if (
    !def.configSchema ||
    typeof (def.configSchema as { safeParse?: unknown }).safeParse !==
      "function"
  ) {
    throw new TemplateDefinitionError(id, "configSchema must be a Zod schema");
  }

  const parsedDefault = def.configSchema.safeParse(def.defaultConfig);
  if (!parsedDefault.success) {
    throw new TemplateDefinitionError(
      id,
      `defaultConfig is invalid against configSchema — ${formatIssues(parsedDefault.error)}`,
    );
  }

  if (def.compat.profileView !== PROFILE_VIEW_VERSION) {
    throw new TemplateDefinitionError(
      id,
      `targets ProfileView v${def.compat.profileView}, but this SDK builds v${PROFILE_VIEW_VERSION}`,
    );
  }
  if (def.compat.sdk !== SDK_VERSION) {
    throw new TemplateDefinitionError(
      id,
      `targets SDK v${def.compat.sdk}, but this is SDK v${SDK_VERSION}`,
    );
  }

  // Every customizable token must exist in every theme preset, or resolving a
  // preset would leave the override with no base to override.
  for (const token of def.customizableTokens ?? []) {
    for (const preset of def.themes) {
      if (!(token in preset.tokens)) {
        throw new TemplateDefinitionError(
          id,
          `customizable token ${token} is missing from theme "${preset.id}"`,
        );
      }
    }
  }

  const frozenBase = {
    compat: Object.freeze({ ...def.compat }),
    themes: Object.freeze(def.themes.map(freezePreset)),
    customizableTokens: def.customizableTokens
      ? Object.freeze([...def.customizableTokens])
      : undefined,
  };

  if (def.kind === "portfolio") {
    // Renderers and page coverage: every declared page needs a renderer, and
    // `home` is mandatory. A stray renderer for an undeclared page is a
    // definition mistake — flag it too.
    if (!def.capabilities.pages.includes("home")) {
      throw new TemplateDefinitionError(
        id,
        "a portfolio template must declare and render the `home` page",
      );
    }
    for (const page of def.capabilities.pages) {
      if (typeof def.pages[page] !== "function") {
        throw new TemplateDefinitionError(
          id,
          `page "${page}" is declared in capabilities.pages but has no renderer`,
        );
      }
    }
    for (const page of Object.keys(def.pages)) {
      if (!def.capabilities.pages.includes(page as never)) {
        throw new TemplateDefinitionError(
          id,
          `page "${page}" has a renderer but is not declared in capabilities.pages`,
        );
      }
    }
    // A required key that isn't a config key would never fire — the check would
    // read `undefined`, call it missing, and nothing the user typed could ever
    // satisfy it. `defaultConfig` parses clean (checked above), so its keys are
    // exactly the config's keys.
    for (const key of def.requirements?.config ?? []) {
      if (!Object.hasOwn(def.defaultConfig as object, key)) {
        throw new TemplateDefinitionError(
          id,
          `requirements.config names "${key}", which is not a key of defaultConfig`,
        );
      }
    }

    return Object.freeze({
      ...def,
      ...frozenBase,
      capabilities: Object.freeze({
        ...def.capabilities,
        pages: Object.freeze([...def.capabilities.pages]),
      }),
      pages: Object.freeze({ ...def.pages }),
      requirements: def.requirements
        ? Object.freeze({
            config: def.requirements.config
              ? Object.freeze([...def.requirements.config])
              : undefined,
            profile: def.requirements.profile
              ? Object.freeze([...def.requirements.profile])
              : undefined,
          })
        : undefined,
    });
  }

  if (typeof def.document !== "function") {
    throw new TemplateDefinitionError(
      id,
      "document must be a renderer function",
    );
  }

  // A bad key here would be silently ignored by `orderedSectionKeys` — the
  // template would just render in canonical order and nobody would know why.
  if (def.defaultSectionOrder) {
    for (const key of def.defaultSectionOrder) {
      if (!SECTION_KEYS.includes(key)) {
        throw new TemplateDefinitionError(
          id,
          `defaultSectionOrder contains "${key}", which is not a profile section key`,
        );
      }
    }
    const unique = new Set(def.defaultSectionOrder);
    if (unique.size !== def.defaultSectionOrder.length) {
      throw new TemplateDefinitionError(
        id,
        "defaultSectionOrder repeats a section key",
      );
    }
  }

  return Object.freeze({
    ...def,
    ...frozenBase,
    capabilities: Object.freeze({
      ...def.capabilities,
      pageSizes: Object.freeze([...def.capabilities.pageSizes]),
    }),
    defaultSectionOrder: def.defaultSectionOrder
      ? Object.freeze([...def.defaultSectionOrder])
      : undefined,
  });
}
