import type { PortfolioPageProps } from "@resfolio/template-sdk";
import type { ReactElement } from "react";

import { Reveal } from "../client/reveal";
import type { DarkAnimeConfig } from "../config";
import {
  SectionHeading,
  Shell,
  WritingCard,
  getSection,
  href,
} from "../shared";

/**
 * `/blog` — every piece of writing, where the home page shows only the first
 * few.
 *
 * It renders the **Writing section of the ProfileView**, not a separate list of
 * posts: natively authored posts and imported articles are one list by the time
 * a template sees them, and this page is the same `WritingCard` the home page
 * uses. That is the whole point of projecting posts into the Profile — the
 * index needed no new data source.
 */
export function BlogPage({
  view,
  theme,
  basePath,
}: PortfolioPageProps<DarkAnimeConfig>): ReactElement {
  const writing = getSection(view, "writing")?.items ?? [];

  return (
    <Shell view={view} theme={theme} basePath={basePath}>
      <section
        className="rf-section"
        style={{ borderTop: 0, paddingTop: "3rem" }}
      >
        <a className="rf-back" href={href(basePath, "home")}>
          ← Home
        </a>
        <div style={{ marginTop: "0.75rem" }}>
          <SectionHeading title="Writing" />
        </div>

        {writing.length === 0 ? (
          <p className="rf-empty">Nothing published yet.</p>
        ) : (
          <div className="rf-writing">
            {writing.map((item, index) => (
              <Reveal key={item.id} delay={Math.min(index, 6) * 0.04}>
                <WritingCard item={item} basePath={basePath} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}
