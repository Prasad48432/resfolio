/** Thrown by `defineTemplate` when a definition violates the SDK contract.
 * In CI this is the enforcement point that keeps every registered template
 * valid against the current SDK (doc 05). */
export class TemplateDefinitionError extends Error {
  constructor(templateId: string, detail: string) {
    super(`Invalid template "${templateId}": ${detail}`);
    this.name = "TemplateDefinitionError";
  }
}

/** Thrown by `resolveTheme` when a requested preset id doesn't exist. */
export class TemplateThemeError extends Error {
  constructor(templateId: string, detail: string) {
    super(`Theme error in template "${templateId}": ${detail}`);
    this.name = "TemplateThemeError";
  }
}
