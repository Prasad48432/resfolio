import type { PortfolioPageProps } from "@resfolio/template-sdk";
import type { ReactElement } from "react";

import type { PortfolioMinimalConfig } from "../config";
import { getSection, ProjectCard, Shell } from "../shared";

/** Projects — the full grid of everything in the profile's `projects`
 * section. Each card links to its detail page. */
export function ProjectsPage({
  view,
  theme,
  basePath,
}: PortfolioPageProps<PortfolioMinimalConfig>): ReactElement {
  const projects = getSection(view, "projects");
  const items = projects?.items ?? [];

  return (
    <Shell view={view} theme={theme} basePath={basePath} active="projects">
      <p className="rf-eyebrow">Portfolio</p>
      <h1 className="rf-section-title">Projects</h1>
      {items.length > 0 ? (
        <div className="rf-grid">
          {items.map((item) => (
            <ProjectCard key={item.id} item={item} basePath={basePath} />
          ))}
        </div>
      ) : (
        <p className="rf-empty">No projects to show yet.</p>
      )}
    </Shell>
  );
}
