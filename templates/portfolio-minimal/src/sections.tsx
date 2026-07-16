import {
  formatCalendarDate,
  formatDateRange,
  renderRichText,
  type ProfileView,
} from "@resfolio/template-sdk";
import type { ReactNode } from "react";

import { displayUrl, getSection, Highlights, type ItemOf } from "./shared";

/**
 * Reusable ProfileView section renderers shared by the About and Résumé
 * pages. Each returns `null` when its section is empty so callers can drop
 * them in unconditionally.
 */

function ExperienceEntry({ item }: { item: ItemOf<"experience"> }): ReactNode {
  const meta = [item.location].filter(Boolean).join(" · ");
  return (
    <div>
      <div className="rf-entry-head">
        <h3 className="rf-entry-title">
          {item.role}
          {item.company ? (
            <>
              {" — "}
              <span className="rf-entry-org">{item.company}</span>
            </>
          ) : null}
        </h3>
        <span className="rf-dates">
          {formatDateRange(item.startDate, item.endDate)}
        </span>
      </div>
      {meta ? <p className="rf-entry-meta">{meta}</p> : null}
      {item.summary ? (
        <div className="rf-entry-body">{renderRichText(item.summary)}</div>
      ) : null}
      <Highlights items={item.highlights} />
    </div>
  );
}

export function ExperienceSection({ view }: { view: ProfileView }): ReactNode {
  const section = getSection(view, "experience");
  if (!section || section.items.length === 0) return null;
  return (
    <section className="rf-section">
      <h2 className="rf-section-title">Experience</h2>
      <div className="rf-entries">
        {section.items.map((item) => (
          <ExperienceEntry key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

export function EducationSection({ view }: { view: ProfileView }): ReactNode {
  const section = getSection(view, "education");
  if (!section || section.items.length === 0) return null;
  return (
    <section className="rf-section">
      <h2 className="rf-section-title">Education</h2>
      <div className="rf-entries">
        {section.items.map((item) => {
          const line = [item.degree, item.area].filter(Boolean).join(", ");
          const meta = [line, item.location, item.score]
            .filter(Boolean)
            .join(" · ");
          return (
            <div key={item.id}>
              <div className="rf-entry-head">
                <h3 className="rf-entry-title">{item.institution}</h3>
                <span className="rf-dates">
                  {formatDateRange(item.startDate, item.endDate)}
                </span>
              </div>
              {meta ? <p className="rf-entry-meta">{meta}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SkillsSection({ view }: { view: ProfileView }): ReactNode {
  const section = getSection(view, "skills");
  if (!section || section.items.length === 0) return null;
  return (
    <section className="rf-section">
      <h2 className="rf-section-title">Skills</h2>
      <div className="rf-skill-groups">
        {section.items.map((group) => (
          <p key={group.id}>
            <span className="rf-skill-name">{group.name}: </span>
            <span className="rf-skill-list">{group.skills.join(" · ")}</span>
          </p>
        ))}
      </div>
    </section>
  );
}

export function WritingSection({ view }: { view: ProfileView }): ReactNode {
  const section = getSection(view, "writing");
  if (!section || section.items.length === 0) return null;
  return (
    <section className="rf-section">
      <h2 className="rf-section-title">Writing</h2>
      <div className="rf-entries">
        {section.items.map((item) => (
          <div key={item.id}>
            <div className="rf-entry-head">
              <h3 className="rf-entry-title">
                {item.url ? <a href={item.url}>{item.title}</a> : item.title}
              </h3>
              <span className="rf-dates">{formatCalendarDate(item.date)}</span>
            </div>
            {item.publisher ? (
              <p className="rf-entry-meta">{item.publisher}</p>
            ) : null}
            {item.summary ? (
              <div className="rf-entry-body">
                {renderRichText(item.summary)}
              </div>
            ) : null}
            {item.url ? (
              <div className="rf-inline-links">
                <a className="rf-social" href={item.url}>
                  {displayUrl(item.url)}
                </a>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
