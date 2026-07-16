import {
  renderRichText,
  themeToStyle,
  type PortfolioPageKind,
  type ProfileView,
  type ResolvedTheme,
} from "@resfolio/template-sdk";
import { Github, Globe, Linkedin, Link2, Mail } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { buildPortfolioStyles } from "./styles";

/**
 * Shared building blocks for `portfolio-minimal`'s pages: the platform-URL
 * link helper, ProfileView section accessors, and the page shell (nav +
 * footer). Keeping URL construction and chrome in one place means the routing
 * strategy lives at a single seam.
 */

// Section/item types derived from the ProfileView contract so the template
// imports only from the SDK — never from domains/*.
type Section = ProfileView["sections"][number];
export type SectionOf<K extends Section["key"]> = Extract<Section, { key: K }>;
export type ItemOf<K extends Section["key"]> = SectionOf<K>["items"][number];

/** The pages this template renders — also the nav order. Keep in sync with
 * `capabilities.pages` in `index.ts`. */
const NAV_PAGES: readonly { page: PortfolioPageKind; label: string }[] = [
  { page: "home", label: "Home" },
  { page: "projects", label: "Projects" },
  { page: "about", label: "About" },
  { page: "resume", label: "Resume" },
];

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

/** The name/handle shown in the nav brand — falls back to a generic label so
 * a nameless draft still renders. */
export function brandLabel(view: ProfileView): string {
  return view.basics.name.trim() || "Portfolio";
}

export function Socials({
  basics,
}: {
  basics: ProfileView["basics"];
}): ReactNode {
  const items: ReactElement[] = [];
  if (basics.contacts.email) {
    items.push(
      <a
        className="rf-social"
        key="email"
        href={`mailto:${basics.contacts.email}`}
      >
        <Mail aria-hidden />
        Email
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
  for (const link of basics.links) {
    items.push(
      <a className="rf-social" key={link.id} href={link.url}>
        {socialIcon(link.label)}
        {link.label}
      </a>,
    );
  }
  if (items.length === 0) return null;
  return <div className="rf-socials">{items}</div>;
}

/** A project card linking to its detail page (slug = the item's stable id).
 * Shared by the home feature grid and the full projects grid. */
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
          {item.technologies.map((tech) => (
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

/**
 * The page shell: the theme root, self-contained stylesheet, sticky nav, and
 * footer. Every page renderer wraps its body in this so navigation and chrome
 * stay identical across pages. A universal component — no client JS required
 * to lay out (motion islands may be layered on later).
 */
export function Shell({
  view,
  theme,
  basePath,
  active,
  children,
}: {
  view: ProfileView;
  theme: ResolvedTheme;
  basePath: string;
  active: PortfolioPageKind;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="rf-site" style={themeToStyle(theme)}>
      <style dangerouslySetInnerHTML={{ __html: buildPortfolioStyles() }} />
      <nav className="rf-nav" aria-label="Primary">
        <div className="rf-container rf-nav-inner">
          <a className="rf-brand" href={href(basePath, "home")}>
            {brandLabel(view)}
          </a>
          <ul className="rf-nav-links">
            {NAV_PAGES.map(({ page, label }) => (
              <li key={page}>
                <a
                  className="rf-nav-link"
                  href={href(basePath, page)}
                  aria-current={page === active ? "page" : undefined}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <main className="rf-main">
        <div className="rf-container">{children}</div>
      </main>
      <footer className="rf-footer">
        <div className="rf-container">
          {brandLabel(view)} · Built with Resfolio
        </div>
      </footer>
    </div>
  );
}
