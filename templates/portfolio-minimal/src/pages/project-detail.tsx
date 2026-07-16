import {
  formatDateRange,
  renderRichText,
  type PortfolioPageProps,
} from "@resfolio/template-sdk";
import { ArrowLeft } from "lucide-react";
import type { ReactElement } from "react";

import type { PortfolioMinimalConfig } from "../config";
import { displayUrl, getSection, Highlights, href, Shell } from "../shared";

/**
 * Project detail — a single project resolved from `params.slug` (the item's
 * stable id). If no project matches, renders a graceful not-found body; the
 * routing host may choose to 404 before dispatching here.
 */
export function ProjectDetailPage({
  view,
  theme,
  basePath,
  params,
}: PortfolioPageProps<PortfolioMinimalConfig>): ReactElement {
  const projects = getSection(view, "projects");
  const item = projects?.items.find((project) => project.id === params.slug);

  const back = (
    <a className="rf-back" href={href(basePath, "projects")}>
      <ArrowLeft aria-hidden width={14} height={14} /> All projects
    </a>
  );

  if (!item) {
    return (
      <Shell view={view} theme={theme} basePath={basePath} active="projects">
        {back}
        <h1 className="rf-detail-title">Project not found</h1>
        <p className="rf-empty">
          This project may have been renamed or removed.
        </p>
      </Shell>
    );
  }

  const dates = formatDateRange(item.startDate, item.endDate);

  return (
    <Shell view={view} theme={theme} basePath={basePath} active="projects">
      {back}
      <h1 className="rf-detail-title">{item.name}</h1>
      {dates ? <p className="rf-dates">{dates}</p> : null}
      {item.description ? (
        <div className="rf-entry-body">{renderRichText(item.description)}</div>
      ) : null}
      {item.technologies.length > 0 ? (
        <div className="rf-tags">
          {item.technologies.map((tech) => (
            <span className="rf-tag" key={tech}>
              {tech}
            </span>
          ))}
        </div>
      ) : null}
      <Highlights items={item.highlights} />
      {item.url || item.repoUrl ? (
        <div className="rf-inline-links">
          {item.url ? (
            <a className="rf-social" href={item.url}>
              {displayUrl(item.url)}
            </a>
          ) : null}
          {item.repoUrl ? (
            <a className="rf-social" href={item.repoUrl}>
              {displayUrl(item.repoUrl)}
            </a>
          ) : null}
        </div>
      ) : null}
    </Shell>
  );
}
