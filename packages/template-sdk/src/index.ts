/**
 * @resfolio/template-sdk — the template contract
 * (docs/architecture/05-template-sdk.md). Templates depend on this package
 * and nothing else platform-side; the platform (dashboard, apps/sites, PDF
 * pipeline) consumes templates only through these types and helpers. Two
 * kinds today: `resume` (a single paginated document) and `portfolio` (a
 * multi-page website, doc 03).
 */
export { defineTemplate } from "./define-template";
export { checkTemplateRequirements } from "./requirements";
export { resolveTheme, themeToStyle, type ResolveThemeOptions } from "./theme";
export {
  formatCalendarDate,
  formatDateRange,
  type DateRangeOptions,
} from "./format";
export { renderRichText, richTextToPlainText } from "./rich-text";
export { renderPostBody, postBodyToPlainText } from "./post-body";
export { TemplateDefinitionError, TemplateThemeError } from "./errors";

export {
  PROFILE_VIEW_VERSION,
  SDK_VERSION,
  PORTFOLIO_PAGE_KINDS,
  type ConfigFieldMeta,
  type MissingRequirement,
  type PageSize,
  type PortfolioCapabilities,
  type PortfolioPageKind,
  type PortfolioPageProps,
  type PortfolioPageRenderer,
  type PortfolioTemplateDefinition,
  type PostView,
  type ProfileRequirementKey,
  type ProfileView,
  type ResolvedTheme,
  type ResumeCapabilities,
  type ResumeDocumentProps,
  type ResumeRenderer,
  type ResumeTemplateDefinition,
  type SectionKey,
  type TemplateCompat,
  type TemplateDefinition,
  type TemplateKind,
  type TemplateRequirements,
  type ThemePreset,
  type ThemeTokens,
  type TokenName,
} from "./types";
