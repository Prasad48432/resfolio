import {
  renderRichText,
  themeToStyle,
  type PortfolioPageKind,
  type ProfileView,
  type ResolvedTheme,
} from "@resfolio/template-sdk";
import { Github, Globe, Linkedin, Link2, Mail } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import type { PortfolioSidebarConfig } from "./config";
import { buildPortfolioStyles } from "./styles";

/**
 * Shared building blocks for `portfolio-sidebar`'s pages: the platform-URL link
 * helper, ProfileView section accessors, and the two-column shell (sticky
 * profile sidebar + content). Keeping URL construction and chrome in one place
 * means the routing strategy lives at a single seam — identical discipline to
 * `portfolio-minimal`, different chrome.
 */

type Section = ProfileView["sections"][number];
export type SectionOf<K extends Section["key"]> = Extract<Section, { key: K }>;
export type ItemOf<K extends Section["key"]> = SectionOf<K>["items"][number];

const NAV_PAGES: readonly { page: PortfolioPageKind; label: string }[] = [
  { page: "home", label: "Home" },
  { page: "projects", label: "Projects" },
  { page: "about", label: "About" },
  { page: "resume", label: "Résumé" },
];

/**
 * Build a stable platform URL. Routing is platform-owned so URLs survive a
 * template switch (doc 04) — this is byte-identical to `portfolio-minimal`'s
 * `href`, which is exactly why switching templates preserves every link.
 * Project detail slugs are the item's stable id, not the mutable name.
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
 * The page shell: theme root, self-contained stylesheet, the sticky profile
 * sidebar (brand, avatar, nav, socials), and the content column. Every page
 * wraps its body in this so chrome stays identical across pages. Universal RSC
 * — no client JS required to lay out.
 */
export function Shell({
  view,
  theme,
  config,
  basePath,
  active,
  children,
}: {
  view: ProfileView;
  theme: ResolvedTheme;
  config: PortfolioSidebarConfig;
  basePath: string;
  active: PortfolioPageKind;
  children: ReactNode;
}): ReactElement {
  const { basics } = view;
  const showAvatar = config.showAvatar && Boolean(basics.avatarUrl);

  return (
    <div
      className="rf-site"
      style={themeToStyle(theme)}
      // Density and sidebar side are fixed template choices (comfortable, left)
      // — the layout stays consistent across every published site.
      data-density="comfortable"
    >
      <style dangerouslySetInnerHTML={{ __html: buildPortfolioStyles() }} />
      <div className="rf-shell" data-side="left">
        <aside className="rf-sidebar">
          <div className="rf-sidebar-inner">
            {showAvatar ? (
              // Templates render a plain <img> — image optimization is the
              // host's concern, never the template's (doc 03).
              <img
                className="rf-avatar"
                src={basics.avatarUrl}
                alt={basics.name || "Portrait"}
              />
            ) : null}
            <a className="rf-brand" href={href(basePath, "home")}>
              {brandLabel(view)}
            </a>
            {basics.headline ? (
              <p className="rf-tagline">{basics.headline}</p>
            ) : null}
            <nav className="rf-nav" aria-label="Primary">
              {NAV_PAGES.map(({ page, label }) => (
                <a
                  key={page}
                  className="rf-nav-link"
                  href={href(basePath, page)}
                  aria-current={page === active ? "page" : undefined}
                >
                  {label}
                </a>
              ))}
            </nav>
            <Socials basics={basics} />
          </div>
        </aside>
        <main className="rf-content">{children}</main>
      </div>
    </div>
  );
}
