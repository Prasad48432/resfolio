import {
  formatCalendarDate,
  formatDateRange,
  renderRichText,
  themeToStyle,
  type ProfileView,
  type ResumeDocumentProps,
} from "@resfolio/template-sdk";
import { Globe, Mail, Phone } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import type { ResumeEditorialConfig } from "./config";
import { buildResumeStyles } from "./styles";

/**
 * `resume-editorial` — a serif, monochrome, centred-masthead resume (doc 02):
 * semantic single-flow HTML in reading order, physical-unit CSS, inline SVG
 * icons, zero client JS. Consumes an already-projected `ProfileView`; knows
 * nothing about storage, selection, or delivery.
 *
 * The visual grammar is two justified rows per entry — a bold title with dates
 * opposite, an italic subtitle with a location opposite — under an uppercase
 * section title that sits on a full-width rule. See `styles.ts`.
 */

// Types derived from the ProfileView contract so this template imports only
// from the SDK — never from domains/*.
type Section = ProfileView["sections"][number];
type SectionOf<K extends Section["key"]> = Extract<Section, { key: K }>;
type ItemOf<K extends Section["key"]> = SectionOf<K>["items"][number];

const SECTION_TITLES: Record<Exclude<Section["key"], "custom">, string> = {
  experience: "Experience",
  projects: "Projects",
  skills: "Technical Skills",
  education: "Education",
  writing: "Writing",
  certifications: "Certifications",
  awards: "Achievements",
  languages: "Languages",
};

/** Strip the scheme and any trailing slash for a compact, ATS-legible URL. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** The host of a URL, or "" if it doesn't parse — used only to label a repo link. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** One entry's two justified rows. Either side of either row may be empty and
 * the row still balances; an entirely empty row is omitted. */
function EntryHead({
  title,
  dates,
  subtitle,
  location,
  side,
}: {
  title: ReactNode;
  dates?: ReactNode;
  subtitle?: ReactNode;
  location?: ReactNode;
  /** Right-hand slot of the title row when it isn't a date (e.g. project links). */
  side?: ReactNode;
}): ReactNode {
  return (
    <>
      <div className="rf-row">
        <h3 className="rf-entry-title">{title}</h3>
        {side ? (
          <span className="rf-entry-side">{side}</span>
        ) : dates ? (
          <span className="rf-dates">{dates}</span>
        ) : null}
      </div>
      {subtitle || location ? (
        <div className="rf-row">
          <p className="rf-entry-subtitle">{subtitle}</p>
          {location ? <span className="rf-entry-loc">{location}</span> : null}
        </div>
      ) : null}
    </>
  );
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
  return (
    <div className="rf-entry">
      <EntryHead
        title={item.role}
        dates={formatDateRange(item.startDate, item.endDate)}
        subtitle={item.company}
        location={item.location}
      />
      {item.summary ? (
        <div className="rf-entry-body">{renderRichText(item.summary)}</div>
      ) : null}
      <Highlights items={item.highlights} />
    </div>
  );
}

function ProjectEntry({ item }: { item: ItemOf<"projects"> }): ReactNode {
  // Tech list rides the title line as an italic " | …" clause, matching the
  // reference; the outbound links sit opposite, labelled rather than spelled out.
  const links: ReactNode[] = [];
  if (item.url) {
    links.push(
      <a key="live" href={item.url}>
        Live
      </a>,
    );
  }
  if (item.repoUrl) {
    // "GitHub" when it is one (the common case, and what the reference shows),
    // else a neutral "Code" — a repo can live on GitLab or elsewhere.
    const isGitHub = /(^|\.)github\.com$/i.test(hostOf(item.repoUrl));
    links.push(
      <a key="repo" href={item.repoUrl}>
        {isGitHub ? "GitHub" : "Code"}
      </a>,
    );
  }

  return (
    <div className="rf-entry">
      <EntryHead
        title={
          <>
            {item.name}
            {item.technologies.length > 0 ? (
              <span className="rf-entry-tech">
                {" | "}
                {item.technologies.join(", ")}
              </span>
            ) : null}
          </>
        }
        side={
          links.length > 0 ? <span className="rf-links">{links}</span> : null
        }
      />
      {item.description ? (
        <div className="rf-entry-body">{renderRichText(item.description)}</div>
      ) : null}
      <Highlights items={item.highlights} />
    </div>
  );
}

function EducationEntry({ item }: { item: ItemOf<"education"> }): ReactNode {
  const line = [item.degree, item.area].filter(Boolean).join(", ");
  const subtitle = [line, item.score].filter(Boolean).join(" - ");
  return (
    <div className="rf-entry">
      <EntryHead
        title={item.institution}
        dates={formatDateRange(item.startDate, item.endDate)}
        subtitle={subtitle}
        location={item.location}
      />
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
      <EntryHead
        title={item.url ? <a href={item.url}>{item.title}</a> : item.title}
        dates={formatCalendarDate(item.date)}
        subtitle={item.publisher}
      />
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
      <EntryHead
        title={item.url ? <a href={item.url}>{item.name}</a> : item.name}
        dates={formatCalendarDate(item.date)}
        subtitle={item.issuer}
      />
    </div>
  );
}

function AwardEntry({ item }: { item: ItemOf<"awards"> }): ReactNode {
  return (
    <div className="rf-entry">
      <EntryHead
        title={item.title}
        dates={formatCalendarDate(item.date)}
        subtitle={item.awarder}
      />
      {item.summary ? (
        <div className="rf-entry-body">{renderRichText(item.summary)}</div>
      ) : null}
    </div>
  );
}

function CustomEntry({ item }: { item: ItemOf<"custom"> }): ReactNode {
  return (
    <div className="rf-entry">
      <EntryHead
        title={item.url ? <a href={item.url}>{item.title}</a> : item.title}
        dates={formatDateRange(item.startDate, item.endDate)}
        subtitle={item.subtitle}
      />
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
          {group.skills.join(" | ")}
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
  const { contacts, links } = basics;
  const items: ReactNode[] = [];

  // Location is deliberately absent from the masthead — the reference keeps it
  // to the education/experience entries where it belongs, so the contact line
  // stays a clean phone · email · links row.
  if (contacts.phone) {
    items.push(
      <span className="rf-contact-item" key="phone">
        {showIcons ? <Phone aria-hidden /> : null}
        {contacts.phone}
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
}: ResumeDocumentProps<ResumeEditorialConfig>): ReactElement {
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

      {/* Summary is a titled section, not header furniture — an <h1> followed
          by prose before any <h2> reads to an ATS parser as unlabelled
          preamble (doc 02). */}
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
