import { formatDateRange, type PortfolioPageProps } from "@resfolio/template-sdk";
import type { ReactElement } from "react";

import type { DarkAnimeConfig } from "../config";
import {
  ExperienceRow,
  SectionHeading,
  Shell,
  Socials,
  getSection,
  href,
} from "../shared";

/**
 * Résumé — the portfolio's on-site résumé view (doc 04's `/resume` route),
 * rendered from the same ProfileView. The downloadable PDF is a different thing
 * entirely: `resume-classic` + the export pipeline (doc 02). This is the web read.
 */
export function ResumePage({
  view,
  config,
  theme,
  basePath,
}: PortfolioPageProps<DarkAnimeConfig>): ReactElement {
  const { basics } = view;
  const experience = getSection(view, "experience")?.items ?? [];
  const education = getSection(view, "education")?.items ?? [];
  const skills = getSection(view, "skills")?.items ?? [];
  const writing = getSection(view, "writing")?.items ?? [];
  const certifications = getSection(view, "certifications")?.items ?? [];

  return (
    <Shell
      view={view}
      theme={theme}
      basePath={basePath}
      showCommandHint={config.showCommandHint}
    >
      <section className="rf-section" style={{ borderTop: 0, paddingTop: "3rem" }}>
        <a className="rf-back" href={href(basePath, "home")}>
          ← Home
        </a>
        <p className="rf-label" style={{ marginTop: "0.75rem" }}>
          Résumé
        </p>
        <h1 className="rf-detail-title">{basics.name || "Résumé"}</h1>
        {basics.headline ? (
          <p className="rf-hero-tagline">{basics.headline}</p>
        ) : null}
        <div style={{ marginTop: "1rem" }}>
          <Socials basics={basics} />
        </div>
      </section>

      {experience.length > 0 ? (
        <section className="rf-section">
          <SectionHeading title="Experience" />
          <ul className="rf-exp">
            {experience.map((item) => (
              <ExperienceRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      {education.length > 0 ? (
        <section className="rf-section">
          <SectionHeading title="Education" />
          <ul className="rf-list">
            {education.map((item) => (
              <li className="rf-list-row" key={item.id}>
                <div className="rf-list-main">
                  <div className="rf-list-title">{item.institution}</div>
                  <div className="rf-list-detail">
                    {[item.degree, item.area].filter(Boolean).join(", ")}
                  </div>
                </div>
                <div className="rf-list-when">
                  {formatDateRange(item.startDate, item.endDate)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {skills.length > 0 ? (
        <section className="rf-section">
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

      {certifications.length > 0 ? (
        <section className="rf-section">
          <SectionHeading title="Certifications" />
          <ul className="rf-list">
            {certifications.map((item) => (
              <li className="rf-list-row" key={item.id}>
                <div className="rf-list-main">
                  <div className="rf-list-title">{item.name}</div>
                  <div className="rf-list-detail">{item.issuer}</div>
                </div>
                <div className="rf-list-when">{item.date}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {writing.length > 0 ? (
        <section className="rf-section">
          <SectionHeading title="Writing" />
          <ul className="rf-list">
            {writing.map((item) => (
              <li className="rf-list-row" key={item.id}>
                <div className="rf-list-main">
                  <div className="rf-list-title">
                    {item.url ? <a href={item.url}>{item.title}</a> : item.title}
                  </div>
                  <div className="rf-list-detail">{item.publisher}</div>
                </div>
                <div className="rf-list-when">{item.date}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  );
}
