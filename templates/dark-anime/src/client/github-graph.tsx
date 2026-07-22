"use client";

import { useEffect, useState, type ReactElement } from "react";
import { GitHubCalendar } from "react-github-calendar";

/**
 * GitHub contribution graph — a client island (doc 05).
 *
 * Renders the contribution calendar with the `react-github-calendar` package,
 * which fetches a public, tokenless endpoint straight from the browser — so
 * unlike a GraphQL proxy it needs no server route or credential on the host, and
 * the template stays a drop-in. The username comes from the profile's GitHub
 * link (`githubUsername` in shared.tsx); the section renders only when the
 * profile has one, the same data-drives-presence rule every other section here
 * follows.
 *
 * **Mount-guarded** — the framework-agnostic equivalent of Next's
 * `dynamic(..., { ssr: false })`: the calendar renders only after the component
 * has mounted on the client, so the server output is a static skeleton. That
 * keeps SSR deterministic (the template's determinism contract) and sidesteps a
 * hydration mismatch over data the server never had. The `@username` link sits
 * outside the guard, so even with no JS the section still says whose it is and
 * links out.
 *
 * The template is dark-only, so the calendar is pinned to its dark ramp (drawn
 * from the near-monochrome `rf-*` palette, not GitHub's green).
 */

const THEME = {
  dark: ["#141417", "#2c2c31", "#54545c", "#8b8b93", "#ededef"],
};

export function GithubGraph({ username }: { username: string }): ReactElement {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="rf-gh">
      <a
        className="rf-gh-user"
        href={`https://github.com/${username}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        @{username}
      </a>
      <div className="rf-gh-cal">
        {mounted ? (
          <GitHubCalendar
            username={username}
            theme={THEME}
            colorScheme="dark"
            fontSize={12}
            blockSize={11}
            blockMargin={3}
            errorMessage="Couldn't load GitHub activity right now."
          />
        ) : (
          <div className="rf-gh-skeleton" aria-hidden />
        )}
      </div>
    </div>
  );
}
