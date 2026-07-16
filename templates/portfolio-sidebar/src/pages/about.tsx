import {
  renderRichText,
  type PortfolioPageProps,
} from "@resfolio/template-sdk";
import type { ReactElement } from "react";

import type { PortfolioSidebarConfig } from "../config";
import { ExperienceSection, WritingSection } from "../sections";
import { Shell } from "../shared";

/**
 * About — the narrative page: the full summary, work history, and writing.
 * Résumé-grade detail lives on the résumé page; About tells the story.
 */
export function AboutPage({
  view,
  config,
  theme,
  basePath,
}: PortfolioPageProps<PortfolioSidebarConfig>): ReactElement {
  const { basics } = view;
  return (
    <Shell view={view} theme={theme} config={config} basePath={basePath} active="about">
      <section className="rf-section">
        <p className="rf-eyebrow">About</p>
        <h1 className="rf-page-title">{basics.name || "About me"}</h1>
        {basics.location ? <p className="rf-dates">{basics.location}</p> : null}
        {basics.summary ? (
          <div className="rf-lead">{renderRichText(basics.summary)}</div>
        ) : null}
      </section>
      <ExperienceSection view={view} />
      <WritingSection view={view} />
    </Shell>
  );
}
