import { renderRichText, type PortfolioPageProps } from "@resfolio/template-sdk";
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

/** About — the long-form read: summary, the full timeline, education, languages. */
export function AboutPage({
  view,
  config,
  theme,
  basePath,
}: PortfolioPageProps<DarkAnimeConfig>): ReactElement {
  const { basics } = view;
  const experience = getSection(view, "experience")?.items ?? [];
  const education = getSection(view, "education")?.items ?? [];
  const languages = getSection(view, "languages")?.items ?? [];

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
        <div style={{ marginTop: "0.75rem" }}>
          <SectionHeading title="About" />
        </div>
        {basics.summary ? (
          <div className="rf-prose">{renderRichText(basics.summary)}</div>
        ) : (
          <p className="rf-empty">Nothing here yet.</p>
        )}
        <div style={{ marginTop: "1.25rem" }}>
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
                  {[item.startDate, item.endDate].filter(Boolean).join(" – ")}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {languages.length > 0 ? (
        <section className="rf-section">
          <SectionHeading title="Languages" />
          <ul className="rf-list">
            {languages.map((item) => (
              <li className="rf-list-row" key={item.id}>
                <div className="rf-list-title">{item.name}</div>
                <div className="rf-list-when">{item.fluency}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  );
}
