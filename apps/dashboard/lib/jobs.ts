import type { JobMatchSummary, JobStatus } from "@resfolio/job";
import { scoreView } from "@resfolio/job";

/**
 * The tracker's view of a job (docs/architecture/06-api-architecture.md).
 *
 * A display mapping and nothing else, in the same spirit as `lib/sources.ts`:
 * the page reads domain records server-side and hands the client plain strings
 * it can render. Business rules — what a status means, which score to show —
 * stay in `@resfolio/job` and are only *called* here.
 */

export interface JobCardView {
  id: string;
  title: string;
  /** Carried alongside `title` because the title is derived from it and lossy —
   * the edit form has to round-trip the real value. See `JobMatchSummary`. */
  role: string | null;
  company: string | null;
  location: string | null;
  jobUrl: string | null;
  status: JobStatus;
  /** The score to display: enhanced when there is one, otherwise the baseline.
   * `scoreView` decides; this file does not re-derive it. */
  score: number | null;
  /** Only when both numbers are real — see `scoreView`. */
  delta: number | null;
  hasResume: boolean;
  hasCoverLetter: boolean;
  /** For the company mark. Null when there is no link, which is common: a
   * posting pasted from an email has no URL to take a domain from. */
  faviconUrl: string | null;
  /**
   * Every status this job has held, in order — the flow view's whole input.
   *
   * **Statuses without their timestamps, because that is all `buildJobFlow`
   * reads.** Carrying the dates would mean serialising them to strings and
   * parsing them back for a function that never looks at them.
   *
   * It travels on the card rather than being summarised server-side so the flow
   * can be recomputed in the browser: the board moves a card optimistically, and
   * a diagram that could only be rebuilt by the server would contradict the
   * column the user just dropped into until the next navigation.
   */
  journey: JobStatus[];
  /** ISO, because a `Date` crossing to a client component is serialised anyway
   * and formatting belongs where the user's locale is. */
  updatedAt: string;
}

export function toJobCardView(job: JobMatchSummary): JobCardView {
  const { score, delta } = scoreView(job);

  return {
    journey: job.statusHistory.map((event) => event.status),
    id: job.id,
    title: job.title,
    role: job.role,
    company: job.company,
    location: job.location,
    jobUrl: job.jobUrl,
    status: job.status,
    score,
    delta,
    hasResume: job.hasResume,
    hasCoverLetter: job.hasCoverLetter,
    faviconUrl: faviconUrl(job.jobUrl),
    updatedAt: job.updatedAt.toISOString(),
  };
}

/** The favicon service's default size. 32 rather than 16 so the mark is not
 * blurry on a retina screen at the 16px it is drawn at. */
export const FAVICON_SIZE = 32;

/**
 * A company mark, from the posting's domain.
 *
 * **Google's favicon service**, which is the pragmatic answer: every job board
 * and company site already has a favicon, and the alternative is asking the user
 * to upload a logo per application. Two things worth knowing before touching it:
 *
 * - **It is a plain `<img>` at the call site, not `next/image`.** Routing a 16px
 *   icon through the optimizer buys nothing and would need a `remotePatterns`
 *   entry; the CSP's `img-src` in `next.config.ts` is the list that does apply,
 *   and `https://www.google.com` has to be on it.
 * - **The domain is sent to Google.** That is inherent to the approach and it is
 *   the standard one, but it is a real fact about the feature: the set of
 *   companies a user is applying to leaves the app as a series of requests.
 *   Every call site has a local fallback icon, so switching this off later is
 *   deleting one function rather than redesigning a card.
 *
 * Returns null rather than a placeholder URL for anything unparseable, so the
 * caller renders its fallback instead of a broken image that flashes first.
 */
export function faviconUrl(
  jobUrl: string | null | undefined,
  size: number = FAVICON_SIZE,
): string | null {
  if (!jobUrl) {
    return null;
  }

  let host: string;
  try {
    const url = new URL(jobUrl);
    // Stored URLs have already been through `normalizeJobUrl`, but this function
    // is also reachable from a form, and a scheme check that only exists
    // upstream is a check that stops existing the moment someone adds a caller.
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    host = url.hostname;
  } catch {
    return null;
  }

  if (!host.includes(".")) {
    return null;
  }

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}

/** What each column is called. Separate from the domain's own labels because
 * these are headings on a board — the flow view softens `ghosted` to "No
 * response", which is right in a diagram of outcomes and too long for a
 * column. */
export const STATUS_LABELS: Record<JobStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "Ghosted",
};

/**
 * The colour each column carries, as token utilities.
 *
 * **Tokens, never hex** — and deliberately quiet. A kanban board is the easiest
 * screen in a product to turn into a traffic light, and a wall of red beside
 * fifteen rejections is a design telling the user how to feel about their own
 * job search. `offer` is the only one that earns the brand colour, because it is
 * the only outcome worth celebrating.
 */
export const STATUS_ACCENTS: Record<JobStatus, string> = {
  saved: "bg-muted/40",
  applied: "bg-brand/40",
  interviewing: "bg-brand/70",
  offer: "bg-live",
  rejected: "bg-muted/60",
  ghosted: "bg-muted/30",
};
