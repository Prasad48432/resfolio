import {
  formatCalendarDate,
  formatDateRange,
  renderRichText,
  themeToStyle,
  type ProfileView,
  type ResumeDocumentProps,
} from "@resfolio/template-sdk";
import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { Fragment, type ReactElement, type ReactNode } from "react";

import type { ResumeClassicConfig } from "./config";
import { buildResumeStyles } from "./styles";

/**
 * `resume-classic` — a clean single-column resume (doc 02): semantic,
 * single-flow HTML in correct reading order, physical-unit CSS, inline SVG
 * icons, zero client JS. Consumes an already-projected `ProfileView`; knows
 * nothing about storage, selection, or delivery.
 */

// Types derived from the ProfileView contract so this template imports only
// from the SDK — never from domains/*.
type Section = ProfileView["sections"][number];
type SectionOf<K extends Section["key"]> = Extract<Section, { key: K }>;
type ItemOf<K extends Section["key"]> = SectionOf<K>["items"][number];

const SECTION_TITLES: Record<Exclude<Section["key"], "custom">, string> = {
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  education: "Education",
  writing: "Writing",
  certifications: "Certifications",
  awards: "Awards",
  languages: "Languages",
};

/** Strip the scheme and any trailing slash for a compact, ATS-legible URL. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function Dates({ children }: { children: ReactNode }): ReactNode {
  if (!children) {
    return null;
  }
  return <span className="rf-dates">{children}</span>;
}

function Highlights({ items }: { items: readonly string[] }): ReactNode {
  if (items.length === 0) {
    return null;
  }
  return (
    <ul className="rf-highlights">
      {items.map((text, index) => (
        <li key={index}>{renderRichText(text, `hl-${index}`)}</li>
      ))}
    </ul>
  );
}

function ExperienceEntry({ item }: { item: ItemOf<"experience"> }): ReactNode {
  const meta = [item.location].filter(Boolean).join(" · ");
  return (
    <div className="rf-entry">
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
        <Dates>{formatDateRange(item.startDate, item.endDate)}</Dates>
      </div>
      {meta ? <p className="rf-entry-meta">{meta}</p> : null}
      {item.summary ? (
        <div className="rf-entry-body">{renderRichText(item.summary)}</div>
      ) : null}
      <Highlights items={item.highlights} />
    </div>
  );
}

/**
 * A project's links, on the title line rather than under the entry.
 *
 * **Labelled, not spelled out** (2026-07-29). They used to render as full URLs
 * in a row of their own below the highlights — two lines of
 * `github.com/name/project` per project, which at three projects is a fifth of
 * the page spent on strings nobody reads and nobody types. The link is the
 * useful thing; the URL is its address.
 *
 * The trade is real and worth stating: a PDF's *text* now says "Live · GitHub"
 * and the address survives only as the link annotation. That is fine for a
 * human and for a machine that follows links, and it does lose the URL for a
 * parser that only extracts text — which is why this is the projects section and
 * not the contact header, where the address is the content.
 */
function ProjectLinks({ item }: { item: ItemOf<"projects"> }): ReactNode {
  const links = [
    item.url ? { label: "Live", href: item.url } : null,
    item.repoUrl ? { label: "GitHub", href: item.repoUrl } : null,
  ].filter((link) => link !== null);

  if (links.length === 0) {
    return null;
  }

  return (
    <span className="rf-entry-links">
      {links.map((link, index) => (
        <Fragment key={link.href}>
          {/* A real element rather than an `a + a::before`, so the separator is
              not inside the second link's clickable box. */}
          {index > 0 ? <span className="rf-sep">·</span> : null}
          <a href={link.href}>{link.label}</a>
        </Fragment>
      ))}
    </span>
  );
}

function ProjectEntry({ item }: { item: ItemOf<"projects"> }): ReactNode {
  const dates = formatDateRange(item.startDate, item.endDate);
  return (
    <div className="rf-entry">
      <div className="rf-entry-head">
        <h3 className="rf-entry-title">{item.name}</h3>
        {/* The right-hand side of the title line carries both, in the order
            every other section establishes: dates hard against the margin, so a
            project with dates lines up with the roles above it. */}
        <span className="rf-entry-aside">
          <ProjectLinks item={item} />
          <Dates>{dates}</Dates>
        </span>
      </div>
      {item.description ? (
        <div className="rf-entry-body">{renderRichText(item.description)}</div>
      ) : null}
      {item.technologies.length > 0 ? (
        <p className="rf-tags">{item.technologies.join(" · ")}</p>
      ) : null}
      <Highlights items={item.highlights} />
    </div>
  );
}

function EducationEntry({ item }: { item: ItemOf<"education"> }): ReactNode {
  const line = [item.degree, item.area].filter(Boolean).join(", ");
  const meta = [line, item.location, item.score].filter(Boolean).join(" · ");
  return (
    <div className="rf-entry">
      <div className="rf-entry-head">
        <h3 className="rf-entry-title">{item.institution}</h3>
        <Dates>{formatDateRange(item.startDate, item.endDate)}</Dates>
      </div>
      {meta ? <p className="rf-entry-meta">{meta}</p> : null}
      {item.summary ? (
        <div className="rf-entry-body">{renderRichText(item.summary)}</div>
      ) : null}
      <Highlights items={item.highlights} />
    </div>
  );
}

function WritingEntry({ item }: { item: ItemOf<"writing"> }): ReactNode {
  return (
    <div className="rf-entry">
      <div className="rf-entry-head">
        <h3 className="rf-entry-title">
          {item.url ? <a href={item.url}>{item.title}</a> : item.title}
        </h3>
        <Dates>{formatCalendarDate(item.date)}</Dates>
      </div>
      {item.publisher ? (
        <p className="rf-entry-meta">{item.publisher}</p>
      ) : null}
      {item.summary ? (
        <div className="rf-entry-body">{renderRichText(item.summary)}</div>
      ) : null}
    </div>
  );
}

function CertificationEntry({
  item,
}: {
  item: ItemOf<"certifications">;
}): ReactNode {
  return (
    <div className="rf-entry">
      <div className="rf-entry-head">
        <h3 className="rf-entry-title">
          {item.url ? <a href={item.url}>{item.name}</a> : item.name}
        </h3>
        <Dates>{formatCalendarDate(item.date)}</Dates>
      </div>
      {item.issuer ? <p className="rf-entry-meta">{item.issuer}</p> : null}
    </div>
  );
}

function AwardEntry({ item }: { item: ItemOf<"awards"> }): ReactNode {
  return (
    <div className="rf-entry">
      <div className="rf-entry-head">
        <h3 className="rf-entry-title">{item.title}</h3>
        <Dates>{formatCalendarDate(item.date)}</Dates>
      </div>
      {item.awarder ? <p className="rf-entry-meta">{item.awarder}</p> : null}
      {item.summary ? (
        <div className="rf-entry-body">{renderRichText(item.summary)}</div>
      ) : null}
    </div>
  );
}

function CustomEntry({ item }: { item: ItemOf<"custom"> }): ReactNode {
  const meta = [item.subtitle].filter(Boolean).join(" · ");
  return (
    <div className="rf-entry">
      <div className="rf-entry-head">
        <h3 className="rf-entry-title">
          {item.url ? <a href={item.url}>{item.title}</a> : item.title}
        </h3>
        <Dates>{formatDateRange(item.startDate, item.endDate)}</Dates>
      </div>
      {meta ? <p className="rf-entry-meta">{meta}</p> : null}
      {item.summary ? (
        <div className="rf-entry-body">{renderRichText(item.summary)}</div>
      ) : null}
      <Highlights items={item.highlights} />
    </div>
  );
}

/** Section heading + entries. A `<section>`/`<h2>` per section keeps the
 * reading order and heading structure ATS parsers rely on (doc 02). */
function SectionBlock({ section }: { section: Section }): ReactNode {
  const title =
    section.key === "custom" ? section.title : SECTION_TITLES[section.key];

  return (
    <section className="rf-section">
      <h2 className="rf-section-title">{title}</h2>
      {renderSectionBody(section)}
    </section>
  );
}

function renderSectionBody(section: Section): ReactNode {
  switch (section.key) {
    case "experience":
      return section.items.map((item) => (
        <ExperienceEntry key={item.id} item={item} />
      ));
    case "projects":
      return section.items.map((item) => (
        <ProjectEntry key={item.id} item={item} />
      ));
    case "education":
      return section.items.map((item) => (
        <EducationEntry key={item.id} item={item} />
      ));
    case "writing":
      return section.items.map((item) => (
        <WritingEntry key={item.id} item={item} />
      ));
    case "certifications":
      return section.items.map((item) => (
        <CertificationEntry key={item.id} item={item} />
      ));
    case "awards":
      return section.items.map((item) => (
        <AwardEntry key={item.id} item={item} />
      ));
    case "custom":
      return section.items.map((item) => (
        <CustomEntry key={item.id} item={item} />
      ));
    case "skills":
      return section.items.map((group) => (
        <p key={group.id} className="rf-skill-group">
          <span className="rf-skill-name">{group.name}: </span>
          {group.skills.join(" · ")}
        </p>
      ));
    case "languages":
      return (
        <div className="rf-langs">
          {section.items.map((lang) => (
            <span key={lang.id}>
              <span className="rf-lang-name">{lang.name}</span>
              {lang.fluency ? (
                <span className="rf-lang-fluency"> — {lang.fluency}</span>
              ) : null}
            </span>
          ))}
        </div>
      );
  }
}

function ContactRow({
  basics,
  showIcons,
  hiddenLinkIds,
}: {
  basics: ProfileView["basics"];
  showIcons: boolean;
  hiddenLinkIds: readonly string[];
}): ReactNode {
  const { location, contacts, links } = basics;
  const items: ReactNode[] = [];

  if (location) {
    items.push(
      <span className="rf-contact-item" key="loc">
        {showIcons ? <MapPin aria-hidden /> : null}
        {location}
      </span>,
    );
  }
  if (contacts.email) {
    items.push(
      <span className="rf-contact-item" key="email">
        {showIcons ? <Mail aria-hidden /> : null}
        <a href={`mailto:${contacts.email}`}>{contacts.email}</a>
      </span>,
    );
  }
  if (contacts.phone) {
    items.push(
      <span className="rf-contact-item" key="phone">
        {showIcons ? <Phone aria-hidden /> : null}
        {contacts.phone}
      </span>,
    );
  }
  if (contacts.website) {
    items.push(
      <span className="rf-contact-item" key="web">
        {showIcons ? <Globe aria-hidden /> : null}
        <a href={contacts.website}>{displayUrl(contacts.website)}</a>
      </span>,
    );
  }
  for (const link of links) {
    if (hiddenLinkIds.includes(link.id)) {
      continue;
    }
    items.push(
      <span className="rf-contact-item" key={link.id}>
        <a href={link.url}>{link.label}</a>
      </span>,
    );
  }

  if (items.length === 0) {
    return null;
  }
  return <div className="rf-contact">{items}</div>;
}

export function ResumeDocument({
  view,
  config,
  theme,
}: ResumeDocumentProps<ResumeClassicConfig>): ReactElement {
  const { basics, sections } = view;

  return (
    <article className="rf-page" style={themeToStyle(theme)}>
      <style dangerouslySetInnerHTML={{ __html: buildResumeStyles(config) }} />

      <header className="rf-header">
        <h1 className="rf-name">{basics.name}</h1>
        <ContactRow
          basics={basics}
          showIcons={config.showIcons}
          hiddenLinkIds={config.hiddenLinkIds}
        />
      </header>

      {/* Summary is a titled section, not header furniture. It used to live
          inside <header> with no heading, which made it the one block on the
          page a reader had to infer the purpose of — and left the document
          with an <h1> followed by prose before any <h2>, a heading structure
          ATS parsers read as unlabelled preamble (doc 02). */}
      {basics.summary ? (
        <section className="rf-section">
          <h2 className="rf-section-title">Summary</h2>
          <div className="rf-summary">{renderRichText(basics.summary)}</div>
        </section>
      ) : null}

      {sections.map((section) => (
        <SectionBlock
          key={section.key === "custom" ? section.id : section.key}
          section={section}
        />
      ))}
    </article>
  );
}
