import {
  formatDateRange,
  renderRichText,
  themeToStyle,
  type PortfolioPageKind,
  type ProfileView,
  type ResolvedTheme,
} from "@resfolio/template-sdk";
import { Github, Globe, Link2, Linkedin } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { CommandPalette, type PaletteItem } from "./client/command-palette";
import { IndexRail, type RailSection } from "./client/index-rail";
import { ThemeToggle } from "./client/theme-toggle";
import { buildPortfolioStyles } from "./styles";

/**
 * Shared building blocks for `dark-anime`: the platform-URL helper, ProfileView
 * accessors, and the page shell (banner + topbar + dashed column + index rail).
 *
 * The shell is a **universal component**: it renders on the server and mounts
 * three client islands (theme toggle, ⌘K palette, index rail). Every island is
 * an enhancement — the page reads, navigates and is fully indexable without a
 * line of JS.
 */

// Section/item types derived from the ProfileView contract so the template
// imports only from the SDK — never from domains/*.
type Section = ProfileView["sections"][number];
export type SectionOf<K extends Section["key"]> = Extract<Section, { key: K }>;
export type ItemOf<K extends Section["key"]> = SectionOf<K>["items"][number];

/**
 * Build a stable platform URL. Routing is platform-owned so URLs survive a
 * template switch (doc 04); the template never hard-codes a username or base.
 * Project detail slugs are the item's stable id, not the (mutable) name.
 */
export function href(
  basePath: string,
  page: PortfolioPageKind,
  slug?: string,
): string {
  const base = basePath.replace(/\/$/, "");
  switch (page) {
    case "home":
      return base || "/";
    case "projects":
      return `${base}/projects`;
    case "projectDetail":
      return `${base}/projects/${slug ?? ""}`;
    case "about":
      return `${base}/about`;
    case "resume":
      return `${base}/resume`;
    case "blog":
      return `${base}/blog`;
    case "blogPost":
      return `${base}/blog/${slug ?? ""}`;
  }
}

export function getSection<K extends Section["key"]>(
  view: ProfileView,
  key: K,
): SectionOf<K> | undefined {
  return view.sections.find((section): section is SectionOf<K> => {
    return section.key === key;
  });
}

/** Strip the scheme and any trailing slash for a compact, legible URL. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function socialIcon(label: string): ReactElement {
  const key = label.toLowerCase();
  if (key.includes("github")) return <Github aria-hidden />;
  if (key.includes("linkedin")) return <Linkedin aria-hidden />;
  return <Link2 aria-hidden />;
}

/** The name shown in the palette/footer — falls back so a nameless draft still
 * renders (the settings form asks for the real one). */
export function brandLabel(view: ProfileView): string {
  return view.basics.name.trim() || "Portfolio";
}

export function SectionHeading({
  title,
  more,
}: {
  title: string;
  more?: { href: string; text: string };
}): ReactElement {
  return (
    <div className="rf-section-head">
      <h2 className="rf-section-title">{title}</h2>
      {more ? (
        <a className="rf-link-more" href={more.href}>
          {more.text} →
        </a>
      ) : null}
    </div>
  );
}

export function Socials({
  basics,
}: {
  basics: ProfileView["basics"];
}): ReactNode {
  const items: ReactElement[] = [];
  for (const link of basics.links) {
    items.push(
      <a className="rf-social" key={link.id} href={link.url}>
        {socialIcon(link.label)}
        {link.label}
      </a>,
    );
  }
  if (basics.contacts.website) {
    items.push(
      <a className="rf-social" key="web" href={basics.contacts.website}>
        <Globe aria-hidden />
        Website
      </a>,
    );
  }
  if (items.length === 0) return null;
  return <div className="rf-socials">{items}</div>;
}

/** A project card linking to its detail page (slug = the item's stable id). */
export function ProjectCard({
  item,
  basePath,
}: {
  item: ItemOf<"projects">;
  basePath: string;
}): ReactElement {
  return (
    <a className="rf-card" href={href(basePath, "projectDetail", item.id)}>
      <div className="rf-card-title">{item.name}</div>
      {item.description ? (
        <div className="rf-card-desc">{renderRichText(item.description)}</div>
      ) : null}
      {item.technologies.length > 0 ? (
        <div className="rf-tags">
          {item.technologies.slice(0, 6).map((tech) => (
            <span className="rf-tag" key={tech}>
              {tech}
            </span>
          ))}
        </div>
      ) : null}
    </a>
  );
}

export function Highlights({ items }: { items: readonly string[] }): ReactNode {
  if (items.length === 0) return null;
  return (
    <ul className="rf-highlights">
      {items.map((text, index) => (
        <li key={index}>{renderRichText(text, `hl-${index}`)}</li>
      ))}
    </ul>
  );
}

/** One experience row — the reference's shape: mark, company/role, dates. */
export function ExperienceRow({
  item,
}: {
  item: ItemOf<"experience">;
}): ReactElement {
  return (
    <li className="rf-exp-row">
      {/* The reference shows a company logo here. We have no logo field and
          won't invent one — a letter mark is honest and needs no upload. */}
      <span className="rf-exp-mark" aria-hidden>
        {item.company.trim().charAt(0).toUpperCase() || "·"}
      </span>
      <div className="rf-exp-main">
        <div className="rf-exp-title">{item.company}</div>
        <div className="rf-exp-role">{item.role}</div>
        {item.summary ? (
          <div className="rf-exp-body">{renderRichText(item.summary)}</div>
        ) : null}
        <Highlights items={item.highlights} />
      </div>
      <div className="rf-exp-meta">
        <div className="rf-exp-when">
          {formatDateRange(item.startDate, item.endDate)}
        </div>
        {item.location ? (
          <div className="rf-exp-where">{item.location}</div>
        ) : null}
      </div>
    </li>
  );
}

/** Everything ⌘K can jump to — the site's pages plus each project. Built on the
 * server; the island only filters and navigates. */
function paletteItems(view: ProfileView, basePath: string): PaletteItem[] {
  const items: PaletteItem[] = [
    { label: "Home", href: href(basePath, "home"), group: "Page" },
    { label: "Work", href: href(basePath, "projects"), group: "Page" },
    { label: "About", href: href(basePath, "about"), group: "Page" },
    { label: "Résumé", href: href(basePath, "resume"), group: "Page" },
  ];
  for (const project of getSection(view, "projects")?.items ?? []) {
    items.push({
      label: project.name,
      href: href(basePath, "projectDetail", project.id),
      group: "Project",
    });
  }
  return items;
}

/**
 * The page shell. `data-theme` is deliberately absent on the server render —
 * the stylesheet's `prefers-color-scheme` rule already gets it right, and the
 * toggle only overrides once a user chooses, so nobody is briefly in the wrong
 * palette waiting for hydration.
 */
export function Shell({
  view,
  theme,
  basePath,
  bannerImage,
  showCommandHint,
  rail,
  children,
}: {
  view: ProfileView;
  theme: ResolvedTheme;
  basePath: string;
  /** Empty on inner pages — the banner is the home page's signature. */
  bannerImage?: string;
  showCommandHint: boolean;
  /** Which sections the INDEX rail lists; empty hides it. Passed in rather
   * than hardcoded: which sections exist depends on the profile, and a rail
   * advertising an empty section is worse than no rail. */
  rail?: readonly RailSection[];
  children: ReactNode;
}): ReactElement {
  return (
    <div className="rf-site" style={themeToStyle(theme)}>
      <style dangerouslySetInnerHTML={{ __html: buildPortfolioStyles() }} />
      <div className="rf-shell">
        {bannerImage ? (
          <div className="rf-banner">
            {/* A plain <img>, not next/image: a template renders on hosts that
                may not be Next at all, and the SDK is framework-light by
                contract (doc 05). */}
            <img src={bannerImage} alt="" />
          </div>
        ) : null}

        <div className="rf-col">
          <div className="rf-topbar">
            <CommandPalette
              items={paletteItems(view, basePath)}
              showHint={showCommandHint}
            />
            {/* Namespaced by basePath so two Resfolio sites in one browser
                don't overwrite each other's choice. */}
            <ThemeToggle storageKey={`rf-theme:${basePath}`} />
          </div>

          <main>{children}</main>

          {/* The reference has no top nav — it's a single-scroll personal site.
              We render separate /projects, /about and /resume routes, so the
              links have to exist *somewhere* in the server HTML: ⌘K is an
              island, and a page reachable only by palette is a page a crawler
              (or anyone with JS off) can't reach at all. The footer keeps the
              reference's clean top while keeping the site navigable. */}
          <footer className="rf-footer">
            <span>{brandLabel(view)}</span>
            <nav className="rf-footer-nav" aria-label="Primary">
              <a href={href(basePath, "home")}>Home</a>
              <a href={href(basePath, "projects")}>Work</a>
              <a href={href(basePath, "about")}>About</a>
              <a href={href(basePath, "resume")}>Résumé</a>
            </nav>
            <span>Built with Resfolio</span>
          </footer>
        </div>

        {rail && rail.length > 0 ? <IndexRail sections={rail} /> : null}
      </div>
    </div>
  );
}
