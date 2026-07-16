import {
  renderRichText,
  type PortfolioPageProps,
} from "@resfolio/template-sdk";
import type { ReactElement } from "react";

import type { PortfolioMinimalConfig } from "../config";
import { ExperienceSection, WritingSection } from "../sections";
import { Shell, Socials } from "../shared";

/**
 * About — the narrative page: the full summary, work history, and writing.
 * Résumé-grade detail lives on the résumé page; About tells the story.
 */
export function AboutPage({
  view,
  theme,
  basePath,
}: PortfolioPageProps<PortfolioMinimalConfig>): ReactElement {
  const { basics } = view;
  return (
    <Shell view={view} theme={theme} basePath={basePath} active="about">
      <p className="rf-eyebrow">About</p>
      <h1 className="rf-section-title">{basics.name || "About me"}</h1>
      {basics.location ? <p className="rf-dates">{basics.location}</p> : null}
      {basics.summary ? (
        <div
          className="rf-lead"
          style={{ marginTop: "1rem", maxWidth: "40rem" }}
        >
          {renderRichText(basics.summary)}
        </div>
      ) : null}
      <Socials basics={basics} />
      <ExperienceSection view={view} />
      <WritingSection view={view} />
    </Shell>
  );
}
