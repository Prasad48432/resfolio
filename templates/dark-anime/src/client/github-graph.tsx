"use client";

import { useEffect, useState, type ReactElement } from "react";

/**
 * GitHub contribution graph — a client island (doc 05), adapted from
 * **github.com/Ashutoshx7/Portfolio-v2-** (`src/components/GithubGraph.tsx` and
 * its `src/app/api/github/route.ts` proxy).
 *
 * Two adaptations to Resfolio's architecture:
 *
 * 1. The username is a **prop**, not a hardcoded login — it comes from the
 *    profile's GitHub link (`githubUsername` in shared.tsx). The section renders
 *    only when the profile actually has one, the same data-drives-presence rule
 *    every other section here follows.
 * 2. Styling is the template's own scoped `rf-*` classes, not Tailwind, so it
 *    renders on any host (doc 05 — a template must not assume its host's build).
 *
 * The calendar is fetched from the host's `/api/github` proxy (GitHub's
 * contribution calendar is only available through the authenticated GraphQL
 * API, so a same-origin proxy holds the token). That proxy is this template's
 * one runtime dependency on its host; where it is absent or unconfigured the
 * graph degrades to a short note and the rest of the page is untouched.
 *
 * **The server render is deterministic**: a static, date-less skeleton. The
 * reference seeded its empty grid from `new Date()`, which would both break this
 * template's determinism contract (render.test.tsx) and cause a hydration
 * mismatch. Real data is fetched only in `useEffect`, on the client.
 */

interface ContributionDay {
  contributionCount: number;
  date: string;
}
interface ContributionWeek {
  contributionDays: ContributionDay[];
}
interface Calendar {
  totalContributions: number;
  months: { name: string }[];
  weeks: ContributionWeek[];
}
type Phase = "loading" | "ready" | "unavailable";
interface Tooltip {
  text: string;
  x: number;
  y: number;
}

const WEEKS = 53;
const DAYS = 7;
const LEVELS = 5;

/** Bucket a day's count into one of five intensity levels (the reference's
 * thresholds), used as a `data-level` the stylesheet colours. */
function levelOf(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 9) return 3;
  return 4;
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export function GithubGraph({ username }: { username: string }): ReactElement {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `rf-github:${username}`;

    // A cached calendar shows instantly, then revalidates — the single-scroll
    // home re-mounts this on every return visit.
    if (typeof window !== "undefined") {
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        try {
          setCalendar(JSON.parse(cached) as Calendar);
          setPhase("ready");
        } catch {
          window.localStorage.removeItem(cacheKey);
        }
      }
    }

    async function load(): Promise<void> {
      try {
        const response = await fetch("/api/github", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
        const data = (await response.json()) as { calendar?: Calendar | null };
        if (cancelled) return;
        if (data.calendar && data.calendar.weeks.length > 0) {
          setCalendar(data.calendar);
          setPhase("ready");
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              cacheKey,
              JSON.stringify(data.calendar),
            );
          }
        } else {
          // Only fall to "unavailable" if a cache hit didn't already show data.
          setPhase((current) =>
            current === "ready" ? "ready" : "unavailable",
          );
        }
      } catch {
        if (!cancelled) {
          setPhase((current) =>
            current === "ready" ? "ready" : "unavailable",
          );
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [username]);

  const profileUrl = `https://github.com/${username}`;

  const status =
    phase === "ready" && calendar
      ? `${calendar.totalContributions.toLocaleString()} contributions in the last year`
      : phase === "unavailable"
        ? "Activity unavailable"
        : "Loading activity…";

  function showTip(
    day: ContributionDay,
    event: { currentTarget: Element },
  ): void {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      text: `${day.contributionCount} contribution${
        day.contributionCount === 1 ? "" : "s"
      } on ${formatDay(day.date)}`,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  }

  return (
    <div className="rf-gh">
      <div className="rf-gh-head">
        <a
          className="rf-gh-user"
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          @{username}
        </a>
        <span className="rf-gh-status" aria-live="polite">
          {status}
        </span>
      </div>

      {phase === "unavailable" ? (
        <p className="rf-gh-note">
          Couldn&apos;t load GitHub activity right now.{" "}
          <a href={profileUrl} target="_blank" rel="noopener noreferrer">
            View the profile on GitHub →
          </a>
        </p>
      ) : (
        <div className="rf-gh-cal">
          {calendar && calendar.months.length > 0 ? (
            <div className="rf-gh-months" aria-hidden>
              {calendar.months.map((month, index) => (
                <span key={`${month.name}-${index}`}>
                  {month.name.slice(0, 3)}
                </span>
              ))}
            </div>
          ) : null}

          <div className="rf-gh-grid" role="img" aria-label={status}>
            {phase === "loading" || !calendar
              ? // Deterministic, date-less skeleton — safe to server-render.
                Array.from({ length: WEEKS }).map((_, week) => (
                  <div className="rf-gh-week" key={week}>
                    {Array.from({ length: DAYS }).map((__, day) => (
                      <span className="rf-gh-cell" data-skeleton key={day} />
                    ))}
                  </div>
                ))
              : calendar.weeks.map((week, weekIndex) => (
                  <div className="rf-gh-week" key={weekIndex}>
                    {week.contributionDays.map((day) => (
                      <span
                        className="rf-gh-cell"
                        data-level={levelOf(day.contributionCount)}
                        key={day.date}
                        onMouseEnter={(event) => showTip(day, event)}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    ))}
                  </div>
                ))}
          </div>

          <div className="rf-gh-legend">
            <span>Less</span>
            {Array.from({ length: LEVELS }).map((_, index) => (
              <span className="rf-gh-cell" data-level={index} key={index} />
            ))}
            <span>More</span>
          </div>
        </div>
      )}

      {tooltip ? (
        <div
          className="rf-gh-tip"
          style={{ left: tooltip.x, top: tooltip.y }}
          role="status"
        >
          {tooltip.text}
        </div>
      ) : null}
    </div>
  );
}
