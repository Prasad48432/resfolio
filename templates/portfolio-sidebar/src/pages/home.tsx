import {
  renderRichText,
  type PortfolioPageProps,
} from "@resfolio/template-sdk";
import { ArrowRight, FileText, Mail } from "lucide-react";
import type { ReactElement } from "react";

import type { PortfolioSidebarConfig } from "../config";
import { getSection, href, ProjectCard, Shell } from "../shared";

/**
 * Home — an intro built from `basics` plus a featured slice of projects. The
 * name/socials live in the persistent sidebar (the shell), so the content
 * column leads with the summary and work.
 */
export function HomePage({
  view,
  config,
  theme,
  basePath,
}: PortfolioPageProps<PortfolioSidebarConfig>): ReactElement {
  const { basics } = view;
  const projects = getSection(view, "projects");
  const featured = projects?.items.slice(0, 4) ?? [];
  const hasMore = (projects?.items.length ?? 0) > 4;

  return (
    <Shell view={view} theme={theme} config={config} basePath={basePath} active="home">
      <section className="rf-section">
        <p className="rf-eyebrow">Hello</p>
        <h1 className="rf-page-title">{basics.name || "Your name"}</h1>
        {basics.headline ? (
          <p className="rf-hero-headline">{basics.headline}</p>
        ) : null}
        {basics.summary ? (
          <div className="rf-lead">{renderRichText(basics.summary)}</div>
        ) : null}
        <div className="rf-actions">
          <a className="rf-btn rf-btn-primary" href={href(basePath, "resume")}>
            <FileText aria-hidden />
            View résumé
          </a>
          {basics.contacts.email ? (
            <a className="rf-btn" href={`mailto:${basics.contacts.email}`}>
              <Mail aria-hidden />
              Get in touch
            </a>
          ) : null}
        </div>
      </section>

      {featured.length > 0 ? (
        <section className="rf-section">
          <p className="rf-eyebrow">Selected work</p>
          <h2 className="rf-section-title">Featured projects</h2>
          <div className="rf-grid">
            {featured.map((item) => (
              <ProjectCard key={item.id} item={item} basePath={basePath} />
            ))}
          </div>
          {hasMore ? (
            <a className="rf-more" href={href(basePath, "projects")}>
              View all projects{" "}
              <ArrowRight aria-hidden width={14} height={14} />
            </a>
          ) : null}
        </section>
      ) : null}
    </Shell>
  );
}
