import type { PortfolioPageProps } from "@resfolio/template-sdk";
import type { ReactElement } from "react";

import type { PortfolioSidebarConfig } from "../config";
import {
  EducationSection,
  ExperienceSection,
  SkillsSection,
} from "../sections";
import { Shell } from "../shared";

/**
 * Résumé — the portfolio's on-site résumé view (doc 04's `/resume` route),
 * rendered from the same ProfileView. The downloadable PDF is produced by the
 * separate resume template + export pipeline (doc 02); this is the web view.
 */
export function ResumePage({
  view,
  config,
  theme,
  basePath,
}: PortfolioPageProps<PortfolioSidebarConfig>): ReactElement {
  const { basics } = view;
  return (
    <Shell view={view} theme={theme} config={config} basePath={basePath} active="resume">
      <section className="rf-section">
        <p className="rf-eyebrow">Résumé</p>
        <h1 className="rf-page-title">{basics.name || "Résumé"}</h1>
        {basics.headline ? (
          <p className="rf-hero-headline">{basics.headline}</p>
        ) : null}
      </section>
      <ExperienceSection view={view} />
      <EducationSection view={view} />
      <SkillsSection view={view} />
    </Shell>
  );
}
