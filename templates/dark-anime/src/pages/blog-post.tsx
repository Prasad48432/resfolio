import {
  formatCalendarDate,
  renderPostBody,
  type PortfolioPageProps,
} from "@resfolio/template-sdk";
import type { ReactElement } from "react";

import type { DarkAnimeConfig } from "../config";
import { Shell, href } from "../shared";

/**
 * One post.
 *
 * The body arrives as `props.post` — resolved by the platform, exactly like
 * `params` and `basePath`. A post body is not part of the Profile (it lives in
 * its own table, doc 07), so the ProfileView cannot carry it and the rule that
 * renderers never fetch data still holds.
 *
 * A missing post degrades to a readable "not found" inside the site's own
 * chrome rather than throwing, matching `ProjectDetailPage`: the platform
 * decides what a 404 is (doc 04), and a template that threw here would take the
 * page down over a stale link.
 *
 * There is no INDEX rail: the rail indexes sections of a long scroll, and a
 * post is one continuous piece of prose with headings the reader scrolls
 * through. Adding one would advertise anchors this page does not define.
 */
export function BlogPostPage({
  view,
  theme,
  basePath,
  post,
}: PortfolioPageProps<DarkAnimeConfig>): ReactElement {
  return (
    <Shell view={view} theme={theme} basePath={basePath}>
      <article
        className="rf-section"
        style={{ borderTop: 0, paddingTop: "3rem" }}
      >
        <a className="rf-back" href={href(basePath, "blog")}>
          ← All writing
        </a>

        {!post ? (
          <h1 className="rf-detail-title">Post not found</h1>
        ) : (
          <>
            <h1 className="rf-detail-title">{post.title}</h1>

            <div className="rf-post-meta">
              {post.publishedOn ? (
                // `<time>` carries the machine-readable date; the visible text
                // stays in the template's own format.
                <time dateTime={post.publishedOn}>
                  {formatCalendarDate(post.publishedOn)}
                </time>
              ) : null}
              {post.readingMinutes > 0 ? (
                <span>{post.readingMinutes} min read</span>
              ) : null}
            </div>

            {post.coverImage ? (
              <div className="rf-post-cover">
                <img src={post.coverImage} alt="" />
              </div>
            ) : null}

            {/* The excerpt is a standfirst, not a repeat of the opening line —
                it only renders when the author actually wrote one distinct from
                the body's first sentence, which is the domain's rule for when
                an excerpt is stored at all. */}
            {post.excerpt ? (
              <p className="rf-post-standfirst">{post.excerpt}</p>
            ) : null}

            <div className="rf-post-body">{renderPostBody(post.body)}</div>

            {post.tags.length > 0 ? (
              <div className="rf-chips" style={{ marginTop: "2rem" }}>
                {post.tags.map((tag) => (
                  <span className="rf-chip" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </article>
    </Shell>
  );
}
