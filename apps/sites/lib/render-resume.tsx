import { PROFILE_VIEW_VERSION, resolveTheme } from "@resfolio/template-sdk";
import type { ReactElement } from "react";

import type { RenderInputs } from "./resolve";
import { getResumeTemplate } from "./templates";

/**
 * The **Render** stage for resumes (docs/architecture/09-rendering-pipeline.md):
 * shared by every surface that shows a resume — the public page, the PDF export
 * route, and the dev fixture route — so they cannot drift. Surfaces differ only
 * in Resolve and Deliver; this is neither.
 */

export class TemplateCompatError extends Error {
  constructor(templateId: string, wants: number) {
    super(
      `Template "${templateId}" targets ProfileView v${wants}, host builds v${PROFILE_VIEW_VERSION}.`,
    );
    this.name = "TemplateCompatError";
  }
}

/** Render failures that are the *document's* fault, not the platform's — an
 * unregistered template or a config the template rejects. Callers turn these
 * into 404/422; they are never a 500. */
export class UnrenderableDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnrenderableDocumentError";
  }
}

export function renderResumeDocument(inputs: RenderInputs): ReactElement {
  const template = getResumeTemplate(inputs.templateId);
  if (!template) {
    throw new UnrenderableDocumentError(
      `No registered resume template "${inputs.templateId}".`,
    );
  }

  // The platform refuses to render a template whose contract it can't satisfy.
  // A real 500: the deployment is internally inconsistent, not the user's doing.
  if (template.compat.profileView !== PROFILE_VIEW_VERSION) {
    throw new TemplateCompatError(template.id, template.compat.profileView);
  }

  const parsed = template.configSchema.safeParse(inputs.config);
  if (!parsed.success) {
    throw new UnrenderableDocumentError(
      `Config rejected by template "${template.id}".`,
    );
  }
  const config = parsed.data;

  const accent = (config as { accent?: string }).accent;
  const theme = resolveTheme(template, {
    overrides: accent ? { "--rf-accent": accent } : undefined,
  });

  const ResumeDocument = template.document;
  return <ResumeDocument view={inputs.view} config={config} theme={theme} />;
}
