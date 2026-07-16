import { TemplateThemeError } from "./errors";
import type {
  ResolvedTheme,
  TemplateDefinition,
  ThemeTokens,
  TokenName,
} from "./types";

export interface ResolveThemeOptions {
  /** Which preset to resolve; defaults to the template's first theme. */
  themeId?: string;
  /** User overrides — only keys listed in `customizableTokens` are applied. */
  overrides?: ThemeTokens;
}

/** The theming surface every kind shares — resolving a theme needs nothing
 * kind-specific, so this stays generic over resume and portfolio templates. */
type ThemeableTemplate = Pick<
  TemplateDefinition,
  "id" | "themes" | "customizableTokens"
>;

/**
 * Merge a template's chosen preset with the user's customizable-token
 * overrides into a flat `ResolvedTheme` (doc 05). Overrides for tokens the
 * template didn't mark customizable are ignored — the customization surface
 * is exactly `customizableTokens`, never the whole token set.
 */
export function resolveTheme(
  template: ThemeableTemplate,
  options: ResolveThemeOptions = {},
): ResolvedTheme {
  const preset = options.themeId
    ? template.themes.find((theme) => theme.id === options.themeId)
    : template.themes[0];

  if (!preset) {
    throw new TemplateThemeError(
      template.id,
      `theme "${options.themeId}" not found`,
    );
  }

  const customizable = new Set<TokenName>(template.customizableTokens ?? []);
  const resolved: ThemeTokens = { ...preset.tokens };

  for (const [token, value] of Object.entries(options.overrides ?? {})) {
    if (customizable.has(token as TokenName) && typeof value === "string") {
      resolved[token as TokenName] = value;
    }
  }

  return resolved;
}

/**
 * A `ResolvedTheme` is already a valid React inline-style object (CSS custom
 * properties are accepted as style keys). This helper exists to make the
 * intent explicit at call sites and to return a fresh object.
 */
export function themeToStyle(theme: ResolvedTheme): Record<string, string> {
  return { ...(theme as Record<string, string>) };
}
