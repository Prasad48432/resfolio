import type { PortfolioPageProps } from "@resfolio/template-sdk";
import type { ReactElement } from "react";

import { Reveal } from "../client/reveal";
import type { DarkAnimeConfig } from "../config";
import {
  ProjectCard,
  SectionHeading,
  Shell,
  getSection,
  href,
} from "../shared";

/** Every project, in the order the view gives them (the user's order — set in
 * the dashboard's sections panel, not here). No banner: that's the home page's
 * signature and repeating it would flatten the site. */
export function ProjectsPage({
  view,
  config,
  theme,
  basePath,
}: PortfolioPageProps<DarkAnimeConfig>): ReactElement {
  const projects = getSection(view, "projects")?.items ?? [];

  return (
    <Shell
      view={view}
      theme={theme}
      basePath={basePath}
      showCommandHint={config.showCommandHint}
    >
      <section
        className="rf-section"
        style={{ borderTop: 0, paddingTop: "3rem" }}
      >
        <a className="rf-back" href={href(basePath, "home")}>
          ← Home
        </a>
        <div style={{ marginTop: "0.75rem" }}>
          <SectionHeading title="Work" />
        </div>
        {projects.length === 0 ? (
          <p className="rf-empty">No projects yet.</p>
        ) : (
          <div className="rf-cards">
            {projects.map((item, index) => (
              <Reveal key={item.id} delay={Math.min(index, 6) * 0.04}>
                <ProjectCard item={item} basePath={basePath} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}
