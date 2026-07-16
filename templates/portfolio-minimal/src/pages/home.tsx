import {
  renderRichText,
  type PortfolioPageProps,
} from "@resfolio/template-sdk";
import { ArrowRight, FileText, Mail } from "lucide-react";
import type { ReactElement } from "react";

import type { PortfolioMinimalConfig } from "../config";
import { getSection, href, ProjectCard, Shell, Socials } from "../shared";

/**
 * Home — the portfolio's front door: a hero built from `basics`, primary
 * actions, socials, and a featured slice of projects that links through to
 * the full grid. Every piece degrades gracefully when the profile is sparse.
 */
export function HomePage({
  view,
  config,
  theme,
  basePath,
}: PortfolioPageProps<PortfolioMinimalConfig>): ReactElement {
  const { basics } = view;
  const projects = getSection(view, "projects");
  const featured = projects?.items.slice(0, config.featuredProjectCount) ?? [];
  const hasMore = (projects?.items.length ?? 0) > config.featuredProjectCount;
  const showAvatar = config.showAvatar && Boolean(basics.avatarUrl);

  return (
    <Shell view={view} theme={theme} basePath={basePath} active="home">
      <section
        className="rf-hero"
        // The hero sits the intro beside the portrait when there's an avatar,
        // and centers it otherwise — a fixed, opinionated composition.
        data-layout={showAvatar ? "aside" : "centered"}
      >
        <div>
          <h1 className="rf-hero-name">{basics.name || "Your name"}</h1>
          {basics.headline ? (
            <p className="rf-hero-headline">{basics.headline}</p>
          ) : null}
          {basics.summary ? (
            <div className="rf-hero-summary">
              {renderRichText(basics.summary)}
            </div>
          ) : null}
          <div className="rf-actions">
            <a
              className="rf-btn rf-btn-primary"
              href={href(basePath, "resume")}
            >
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
          <Socials basics={basics} />
        </div>
        {showAvatar ? (
          // Templates render a plain <img> — image optimization is the host's
          // concern, never the template's (doc 03).
          <img
            className="rf-avatar"
            src={basics.avatarUrl}
            alt={basics.name || "Portrait"}
          />
        ) : null}
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
