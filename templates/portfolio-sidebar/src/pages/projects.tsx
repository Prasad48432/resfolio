import type { PortfolioPageProps } from "@resfolio/template-sdk";
import type { ReactElement } from "react";

import type { PortfolioSidebarConfig } from "../config";
import { getSection, ProjectCard, Shell } from "../shared";

/** Projects — the full grid of everything in the profile's `projects`
 * section. Each card links to its detail page. */
export function ProjectsPage({
  view,
  config,
  theme,
  basePath,
}: PortfolioPageProps<PortfolioSidebarConfig>): ReactElement {
  const projects = getSection(view, "projects");
  const items = projects?.items ?? [];

  return (
    <Shell view={view} theme={theme} config={config} basePath={basePath} active="projects">
      <section className="rf-section">
        <p className="rf-eyebrow">Portfolio</p>
        <h1 className="rf-page-title">Projects</h1>
        {items.length > 0 ? (
          <div className="rf-grid">
            {items.map((item) => (
              <ProjectCard key={item.id} item={item} basePath={basePath} />
            ))}
          </div>
        ) : (
          <p className="rf-empty">No projects to show yet.</p>
        )}
      </section>
    </Shell>
  );
}
