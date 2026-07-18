import {
  formatDateRange,
  renderRichText,
  type PortfolioPageProps,
} from "@resfolio/template-sdk";
import { ExternalLink, Github } from "lucide-react";
import type { ReactElement } from "react";

import type { DarkAnimeConfig } from "../config";
import { Highlights, Shell, displayUrl, getSection, href } from "../shared";

/**
 * One project. `params.slug` is the item's stable id (see `href`), so renaming
 * a project never breaks its URL.
 *
 * An unknown slug degrades to a readable "not found" inside the site's own
 * chrome rather than throwing: the platform decides what a 404 is (doc 04), and
 * a template that threw here would take the whole page down over a stale link.
 */
export function ProjectDetailPage({
  view,
  config,
  theme,
  params,
  basePath,
}: PortfolioPageProps<DarkAnimeConfig>): ReactElement {
  const project = getSection(view, "projects")?.items.find(
    (item) => item.id === params["slug"],
  );

  return (
    <Shell
      view={view}
      theme={theme}
      basePath={basePath}
      showCommandHint={config.showCommandHint}
    >
      <section className="rf-section" style={{ borderTop: 0, paddingTop: "3rem" }}>
        <a className="rf-back" href={href(basePath, "projects")}>
          ← All work
        </a>

        {!project ? (
          <h1 className="rf-detail-title">Project not found</h1>
        ) : (
          <>
            <h1 className="rf-detail-title">{project.name}</h1>
            <div className="rf-socials">
              {project.startDate ? (
                <span className="rf-list-when">
                  {formatDateRange(project.startDate, project.endDate)}
                </span>
              ) : null}
              {project.url ? (
                <a className="rf-social" href={project.url}>
                  <ExternalLink aria-hidden />
                  {displayUrl(project.url)}
                </a>
              ) : null}
              {project.repoUrl ? (
                <a className="rf-social" href={project.repoUrl}>
                  <Github aria-hidden />
                  Source
                </a>
              ) : null}
            </div>

            {project.description ? (
              <div className="rf-prose" style={{ marginTop: "1.5rem" }}>
                {renderRichText(project.description)}
              </div>
            ) : null}
            <Highlights items={project.highlights} />

            {project.technologies.length > 0 ? (
              <div className="rf-chips" style={{ marginTop: "1.5rem" }}>
                {project.technologies.map((tech) => (
                  <span className="rf-chip" key={tech}>
                    {tech}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>
    </Shell>
  );
}
