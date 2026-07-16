import type { PortfolioPageProps } from "@resfolio/template-sdk";
import type { ReactElement } from "react";

import type { PortfolioMinimalConfig } from "../config";
import {
  EducationSection,
  ExperienceSection,
  SkillsSection,
} from "../sections";
import { Shell } from "../shared";

/**
 * Résumé — the portfolio's on-site résumé view (doc 04's `/resume` route),
 * rendered from the same ProfileView. A downloadable PDF is produced by the
 * separate resume template + export pipeline (doc 02); this is the web view.
 */
export function ResumePage({
  view,
  theme,
  basePath,
}: PortfolioPageProps<PortfolioMinimalConfig>): ReactElement {
  const { basics } = view;
  return (
    <Shell view={view} theme={theme} basePath={basePath} active="resume">
      <p className="rf-eyebrow">Résumé</p>
      <h1 className="rf-section-title">{basics.name || "Résumé"}</h1>
      {basics.headline ? (
        <p className="rf-hero-headline">{basics.headline}</p>
      ) : null}
      <ExperienceSection view={view} />
      <EducationSection view={view} />
      <SkillsSection view={view} />
    </Shell>
  );
}
