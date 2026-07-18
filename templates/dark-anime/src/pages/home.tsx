import {
  renderRichText,
  type PortfolioPageProps,
} from "@resfolio/template-sdk";
import { CalendarDays, Mail } from "lucide-react";
import type { ReactElement } from "react";

import type { RailSection } from "../client/index-rail";
import { Reveal } from "../client/reveal";
import type { DarkAnimeConfig } from "../config";
import {
  ExperienceRow,
  ProjectCard,
  SectionHeading,
  Shell,
  Socials,
  getSection,
  href,
} from "../shared";

/**
 * Home — the whole site in one scroll, as the reference has it: banner, avatar
 * over its edge, name + tagline, bio, CTAs, socials, then Experience, Projects,
 * Skills, Writing, and an optional quote.
 *
 * Every section is conditional on the ProfileView actually having the content,
 * and the INDEX rail is built from the same conditions — so a sparse profile
 * renders a shorter, still-coherent page instead of a run of empty headings and
 * a rail pointing at nothing. That's also why `requirements` in `index.ts` asks
 * for the few things the hero genuinely can't do without.
 */
export function HomePage({
  view,
  config,
  theme,
  basePath,
}: PortfolioPageProps<DarkAnimeConfig>): ReactElement {
  const { basics } = view;
  const projects = getSection(view, "projects")?.items ?? [];
  const featured = projects.slice(0, config.featuredProjectCount);
  const experience = getSection(view, "experience")?.items ?? [];
  const skills = getSection(view, "skills")?.items ?? [];
  const writing = getSection(view, "writing")?.items ?? [];

  // The rail lists only what's actually on the page.
  const rail: RailSection[] = [
    experience.length > 0 && { id: "experience", label: "Experience" },
    featured.length > 0 && { id: "projects", label: "Projects" },
    skills.length > 0 && { id: "skills", label: "Skills" },
    writing.length > 0 && { id: "writing", label: "Writing" },
    Boolean(config.quote) && { id: "quote", label: "Quote" },
  ].filter((entry): entry is RailSection => Boolean(entry));

  return (
    <Shell
      view={view}
      theme={theme}
      basePath={basePath}
      bannerImage={config.bannerImage || undefined}
      showCommandHint={config.showCommandHint}
      rail={rail}
    >
      <header className="rf-hero">
        <div className="rf-hero-id">
          {config.showAvatar && basics.avatarUrl ? (
            <img className="rf-avatar" src={basics.avatarUrl} alt="" />
          ) : null}
          <div>
            <h1 className="rf-hero-name">{basics.name}</h1>
            {config.tagline ? (
              <p className="rf-hero-tagline">{config.tagline}</p>
            ) : null}
          </div>
        </div>

        {basics.summary ? (
          <div className="rf-hero-summary">
            {renderRichText(basics.summary)}
          </div>
        ) : null}

        {config.introCallUrl || basics.contacts.email ? (
          <div className="rf-cta">
            {config.introCallUrl ? (
              <a className="rf-btn rf-btn-primary" href={config.introCallUrl}>
                <CalendarDays aria-hidden />
                Book an intro call
              </a>
            ) : null}
            {basics.contacts.email ? (
              <a className="rf-btn" href={`mailto:${basics.contacts.email}`}>
                <Mail aria-hidden />
                Send an email
              </a>
            ) : null}
          </div>
        ) : null}

        {basics.links.length > 0 || basics.contacts.website ? (
          <>
            <p className="rf-socials-label">
              Here are my <strong>socials</strong>
            </p>
            <Socials basics={basics} />
          </>
        ) : null}
      </header>

      {experience.length > 0 ? (
        <section className="rf-section" id="experience">
          <SectionHeading title="Experience" />
          <ul className="rf-exp">
            {experience.map((item) => (
              <ExperienceRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      {featured.length > 0 ? (
        <section className="rf-section" id="projects">
          <SectionHeading
            title="Projects"
            more={
              projects.length > featured.length
                ? { href: href(basePath, "projects"), text: "View all" }
                : undefined
            }
          />
          <div className="rf-cards">
            {featured.map((item, index) => (
              <Reveal key={item.id} delay={Math.min(index, 6) * 0.04}>
                <ProjectCard item={item} basePath={basePath} />
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}

      {skills.length > 0 ? (
        <section className="rf-section" id="skills">
          <SectionHeading title="Skills" />
          {skills.map((group) => (
            <div className="rf-skill-group" key={group.id}>
              <p className="rf-skill-name">{group.name}</p>
              <div className="rf-chips">
                {group.skills.map((skill) => (
                  <span className="rf-chip" key={skill}>
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {writing.length > 0 ? (
        <section className="rf-section" id="writing">
          <SectionHeading title="Writing" />
          <ul className="rf-list">
            {writing.map((item) => (
              <li className="rf-list-row" key={item.id}>
                <div className="rf-list-main">
                  <div className="rf-list-title">
                    {item.url ? (
                      <a href={item.url}>{item.title}</a>
                    ) : (
                      item.title
                    )}
                  </div>
                  <div className="rf-list-detail">{item.publisher}</div>
                </div>
                <div className="rf-list-when">{item.date}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {config.quote ? (
        <section className="rf-section" id="quote">
          <Reveal>
            <figure>
              <blockquote className="rf-quote-text">
                “{config.quote}”
              </blockquote>
              {config.quoteAttribution ? (
                <figcaption className="rf-label rf-quote-attr">
                  — {config.quoteAttribution}
                </figcaption>
              ) : null}
            </figure>
          </Reveal>
        </section>
      ) : null}
    </Shell>
  );
}
