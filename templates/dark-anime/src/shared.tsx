import {
  formatCalendarDate,
  formatDateRange,
  renderRichText,
  themeToStyle,
  type PortfolioPageKind,
  type ProfileView,
  type ResolvedTheme,
} from "@resfolio/template-sdk";
import { ArrowUpRight, Github, Globe, Link2, Linkedin } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { BannerEmbers } from "./client/banner-embers";
import { CommandPalette, type PaletteItem } from "./client/command-palette";
import { IndexRail, type RailSection } from "./client/index-rail";
import { buildPortfolioStyles } from "./styles";

/**
 * Shared building blocks for `dark-anime`: the platform-URL helper, ProfileView
 * accessors, and the page shell (banner + topbar + dashed column + index rail).
 *
 * The shell is a **universal component**: it renders on the server and mounts
 * the ⌘K palette and index rail islands. Every island is an enhancement — the
 * page reads, navigates and is fully indexable without a line of JS.
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

/** GitHub paths that are site chrome, not usernames — a link to one of these is
 * not a profile. Kept small: the goal is to reject the obvious non-profiles, not
 * to mirror GitHub's full reserved list. */
const GITHUB_NON_PROFILE = new Set([
  "features",
  "topics",
  "collections",
  "trending",
  "marketplace",
  "sponsors",
  "about",
  "pricing",
  "enterprise",
  "login",
  "join",
  "settings",
  "notifications",
  "explore",
  "orgs",
  "apps",
  "search",
]);

/**
 * The GitHub username from the first `github.com/<user>` profile link in the
 * profile, or null. **Data, not config, decides whether the activity graph
 * renders** — the same rule every other section here follows (config.ts records
 * why the removed `showGithubGraph` toggle is not coming back).
 *
 * Only a bare profile URL counts: `github.com/<user>/<repo>` is a project link,
 * not an identity, so anything with more than one path segment is ignored.
 */
export function githubUsername(basics: ProfileView["basics"]): string | null {
  for (const link of basics.links) {
    let url: URL;
    try {
      url = new URL(link.url);
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") continue;
    const segments = url.pathname.split("/").filter(Boolean);
    const handle = segments[0];
    if (segments.length !== 1 || !handle) continue;
    if (!/^[a-zA-Z0-9-]{1,39}$/.test(handle)) continue;
    if (GITHUB_NON_PROFILE.has(handle.toLowerCase())) continue;
    return handle;
  }
  return null;
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

/**
 * One Writing entry.
 *
 * The Writing section is deliberately **one list of one shape**: a post written
 * natively in Resfolio and an article imported from RSS arrive here identical
 * (the blog domain projects posts into the ProfileView before this template
 * ever runs), so nothing below asks where an entry came from. The only thing
 * that differs is the destination, and that falls out of the data:
 *
 * - `slug` present → a native post, read on this site at `<basePath>/blog/<slug>`.
 * - `url` present → it lives somewhere else; link out and mark it so.
 * - neither → a talk or a publication with no link. Still worth listing.
 *
 * Cover, tags and reading time are all optional and each collapses cleanly,
 * because a Profile is allowed to be sparse (the `jun` fixture is the test).
 */
export function WritingCard({
  item,
  basePath,
}: {
  item: ItemOf<"writing">;
  basePath: string;
}): ReactElement {
  const destination = item.slug
    ? href(basePath, "blogPost", item.slug)
    : item.url;
  const external = !item.slug && Boolean(item.url);

  const meta = [
    formatCalendarDate(item.date),
    item.readingMinutes ? `${item.readingMinutes} min read` : "",
    item.publisher,
  ].filter(Boolean);

  const body = (
    <>
      {item.coverImage ? (
        <div className="rf-write-cover">
          {/* A plain <img> for the same reason the banner is one: a template
              renders on hosts that may not be Next at all (doc 05). */}
          <img src={item.coverImage} alt="" loading="lazy" />
        </div>
      ) : null}
      <div className="rf-write-body">
        <div className="rf-write-title">
          {item.title}
          {external ? (
            <ArrowUpRight className="rf-write-out" aria-hidden />
          ) : null}
        </div>
        {item.summary ? (
          <div className="rf-write-excerpt">{renderRichText(item.summary)}</div>
        ) : null}
        {meta.length > 0 ? (
          <div className="rf-write-meta">
            {meta.map((entry) => (
              <span key={entry}>{entry}</span>
            ))}
          </div>
        ) : null}
        {item.tags.length > 0 ? (
          <div className="rf-tags">
            {item.tags.slice(0, 4).map((tag) => (
              <span className="rf-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );

  // An unlinked entry must not render an <a> with no href — it would be
  // focusable, announced as a link, and go nowhere.
  return destination ? (
    <a
      className="rf-write"
      href={destination}
      {...(external ? { rel: "noopener noreferrer" } : {})}
    >
      {body}
    </a>
  ) : (
    <div className="rf-write">{body}</div>
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
 * One experience row — the reference's shape: mark, company/role, dates.
 *
 * **The mark belongs to the header, not to the row.** It used to be the first
 * child of the row's own flex, which made it a column running the full height of
 * the entry — so the description was indented under it and, on a phone, read in a
 * gutter two thirds of the card wide. The mark is 2rem plus a 0.875rem gap; on a
 * 360px screen that is a fifth of the line gone, permanently, to identify a
 * company already named on the line above.
 *
 * So the row is now a column of two: a header (mark · company/role · dates) and
 * the description below it, at the card's full width. Desktop is unchanged — the
 * header is the same three-part row it always was — and the mobile gutter is gone
 * because there is no longer anything beside the prose to reserve space for it.
 */
export function ExperienceRow({
  item,
}: {
  item: ItemOf<"experience">;
}): ReactElement {
  const hasBody = Boolean(item.summary) || item.highlights.length > 0;

  return (
    <li className="rf-exp-row">
      <div className="rf-exp-head">
        {/* The reference shows a company logo here. We have no logo field and
            won't invent one — a letter mark is honest and needs no upload. */}
        <span className="rf-exp-mark" aria-hidden>
          {item.company.trim().charAt(0).toUpperCase() || "·"}
        </span>
        <div className="rf-exp-main">
          <div className="rf-exp-title">{item.company}</div>
          <div className="rf-exp-role">{item.role}</div>
        </div>
        <div className="rf-exp-meta">
          <div className="rf-exp-when">
            {formatDateRange(item.startDate, item.endDate)}
          </div>
          {item.location ? (
            <div className="rf-exp-where">{item.location}</div>
          ) : null}
        </div>
      </div>

      {/* Outside the header's flex, so nothing above it reserves horizontal
          space here. Rendered only when there is something to render, or an
          empty entry would carry a stray margin. */}
      {hasBody ? (
        <div className="rf-exp-body">
          {item.summary ? renderRichText(item.summary) : null}
          <Highlights items={item.highlights} />
        </div>
      ) : null}
    </li>
  );
}

/** Everything ⌘K can jump to — the site's pages, each project, and each Writing
 * entry. Built on the server; the island only filters and navigates. Writing is
 * added the same way the home page links it: a native post (has a `slug`) opens
 * on-site, an imported one links out, and an entry with neither is skipped
 * because there is nowhere to send it. */
function paletteItems(view: ProfileView, basePath: string): PaletteItem[] {
  const writing = getSection(view, "writing")?.items ?? [];
  const items: PaletteItem[] = [
    { label: "Home", href: href(basePath, "home"), group: "Page" },
    { label: "Work", href: href(basePath, "projects"), group: "Page" },
    { label: "About", href: href(basePath, "about"), group: "Page" },
  ];
  if (writing.length > 0) {
    items.push({
      label: "Writing",
      href: href(basePath, "blog"),
      group: "Page",
    });
  }
  for (const project of getSection(view, "projects")?.items ?? []) {
    items.push({
      label: project.name,
      href: href(basePath, "projectDetail", project.id),
      group: "Project",
    });
  }
  for (const entry of writing) {
    const destination = entry.slug
      ? href(basePath, "blogPost", entry.slug)
      : entry.url;
    if (destination) {
      items.push({ label: entry.title, href: destination, group: "Writing" });
    }
  }
  return items;
}

/**
 * The page shell. The template is dark-only, so there is no `data-theme` and no
 * theme toggle — the single palette in `styles.ts` is always in force.
 */
export function Shell({
  view,
  theme,
  basePath,
  bannerImage,
  rail,
  children,
}: {
  view: ProfileView;
  theme: ResolvedTheme;
  basePath: string;
  /** Empty on inner pages — the banner is the home page's signature. */
  bannerImage?: string;
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
            {/* Atmosphere only — see the island's header for why this one is
                allowed to render nothing without costing the page anything. */}
            <BannerEmbers />
            {/* Edge falloff. The banner is a hard-cropped photo the user chose
                and we didn't; feathering it into the page background is what
                keeps an arbitrary image from reading as a pasted rectangle,
                and it's the same reason the bottom fade is heavier than the
                sides — that edge meets the hero. */}
            <div className="rf-banner-fade" aria-hidden />
          </div>
        ) : null}

        <div className="rf-col">
          <div className="rf-topbar">
            {/* The ⌘K badge is always shown: the palette is the primary way
                around this template, and a shortcut nobody is told about is a
                shortcut nobody uses. */}
            <CommandPalette items={paletteItems(view, basePath)} showHint />
          </div>

          <main>{children}</main>

          {/* The reference has no top nav — it's a single-scroll personal site.
              We render separate /projects, /about and /blog routes, so the links
              have to exist *somewhere* in the server HTML: ⌘K is an island, and
              a page reachable only by palette is a page a crawler (or anyone
              with JS off) can't reach at all. The footer keeps the reference's
              clean top while keeping the site navigable. Writing appears only
              when there are posts — an empty /blog isn't worth a nav slot. */}
          <footer className="rf-footer">
            <span>{brandLabel(view)}</span>
            <nav className="rf-footer-nav" aria-label="Primary">
              <a href={href(basePath, "home")}>Home</a>
              <a href={href(basePath, "projects")}>Work</a>
              <a href={href(basePath, "about")}>About</a>
              {(getSection(view, "writing")?.items.length ?? 0) > 0 ? (
                <a href={href(basePath, "blog")}>Writing</a>
              ) : null}
            </nav>
            <span>Built with Resfolio</span>
          </footer>
        </div>

        {rail && rail.length > 0 ? <IndexRail sections={rail} /> : null}
      </div>
    </div>
  );
}
