import { type JobStatus } from "./match";

/**
 * The job search, as a flow.
 *
 * **This is what a set of applications *did*, which is why it is business logic
 * and not a chart.** The dashboard turns these counts into rectangles and
 * ribbons; deciding that an application which reached `offer` without ever
 * touching `interviewing` still counts as having interviewed — or, as here,
 * deciding that it does not — is a claim about the user's job search, and claims
 * belong in the domain where they can be tested without a browser.
 *
 * ## Why history and not the status column
 *
 * A row sitting in `rejected` might have been turned down after three interviews
 * or filtered out the day it was sent. The `status` column cannot tell those
 * apart, so a flow derived from it has to invent its own middle — every offer
 * drawn as having interviewed, and "declined after interview" undrawable
 * entirely. {@link JobMatchSummary.statusHistory} records each change as it
 * happens, so the diagram reports transitions that were observed rather than
 * ones that were plausible.
 *
 * ## The shape
 *
 * Three stages, because that is the shape of applying for jobs and not an
 * arbitrary depth limit:
 *
 * ```
 *                    ┌── Interviewing ──┬── Offer
 *   Applied ─────────┤                  ├── Rejected
 *                    ├── Rejected       └── No response
 *                    └── No response
 * ```
 *
 * `saved` is not in it. A posting you read and never applied to is a bookmark,
 * not an application, and counting bookmarks in a funnel makes every rate below
 * it look worse than it is. The board is where saved jobs live.
 */

/** The stage a node sits in, left to right. Not the same as its status: both
 * `rejected` nodes are the same status at different points in the story, and
 * merging them is exactly the information loss this file exists to avoid. */
export type FlowStage = 0 | 1 | 2;

/**
 * What this needs of a job: the statuses it has held, in order.
 *
 * **Deliberately narrower than `JobMatchSummary`.** Only the sequence is read —
 * never a timestamp, never a score, never a title — and saying so in the type is
 * what lets the dashboard run this in the browser against its own display DTO.
 * That matters more than it sounds: the board moves a card optimistically, and a
 * flow that could only be computed on the server would disagree with the board
 * beside it until the next navigation.
 */
export interface JobJourney {
  statusHistory: readonly { status: JobStatus }[];
}

export interface FlowNode {
  /** Unique within a flow — `stage`-qualified, because `rejected` appears
   * twice. */
  id: string;
  label: string;
  /** The status this node represents, for colour and for a board link. */
  status: JobStatus;
  stage: FlowStage;
  count: number;
}

export interface FlowLink {
  from: string;
  to: string;
  count: number;
}

export interface JobFlow {
  nodes: FlowNode[];
  links: FlowLink[];
  /** Applications, i.e. everything that ever reached `applied`. The denominator
   * for every rate below, and zero when the user has only saved jobs. */
  applied: number;
  interviewed: number;
  offers: number;
  rejected: number;
  ghosted: number;
}

/** What a status is called on the diagram. `ghosted` is softened because the
 * user is reading it about themselves — the fact is "nobody replied", and
 * "Ghosted" as a heading over twenty-five of your own applications is a
 * judgement the product does not need to make. */
const LABELS: Record<JobStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "No response",
};

/** Terminal states, in the order they should stack. */
const OUTCOMES = ["offer", "rejected", "ghosted"] as const;
type Outcome = (typeof OUTCOMES)[number];

/**
 * One job's journey, reduced to the two facts the diagram needs.
 *
 * Read from the history in order rather than by looking for statuses anywhere in
 * it, because *when* something happened is the whole question: a job that went
 * `applied → rejected` and one that went `applied → interviewing → rejected`
 * both contain `rejected`.
 */
function journeyOf(history: readonly { status: JobStatus }[]): {
  applied: boolean;
  interviewed: boolean;
  /** Where it ended up, or null if it is still in flight. */
  outcome: Outcome | null;
} {
  let applied = false;
  let interviewed = false;
  let outcome: Outcome | null = null;

  for (const event of history) {
    switch (event.status) {
      case "applied":
        applied = true;
        // A job re-opened after a rejection is in flight again. Keeping the old
        // outcome would draw a closed door that is currently open.
        outcome = null;
        break;
      case "interviewing":
        // An interview implies the application, even if the user dragged the
        // card straight from Saved. The alternative is dropping the row from
        // the diagram entirely, which is worse: the interview certainly
        // happened.
        applied = true;
        interviewed = true;
        outcome = null;
        break;
      case "offer":
      case "rejected":
      case "ghosted":
        applied = true;
        outcome = event.status;
        break;
      case "saved":
        break;
    }
  }

  return { applied, interviewed, outcome };
}

const nodeId = (status: JobStatus, stage: FlowStage): string =>
  `${stage}:${status}`;

/**
 * Count the journeys, then keep only what happened.
 *
 * **Empty nodes and empty links are dropped**, so a user with no offers gets a
 * diagram with no Offer box rather than a box labelled zero. A zero-height
 * rectangle with a label floating beside it is the thing that makes a chart look
 * broken, and it also reports an outcome the user has not had.
 */
export function buildJobFlow(jobs: readonly JobJourney[]): JobFlow {
  const stage1: Record<string, number> = {};
  const stage2: Record<string, number> = {};
  let applied = 0;
  let interviewed = 0;
  /** Still in flight after applying, having not interviewed — these have no
   * stage-1 node yet, and drawing a ribbon to nothing is drawing a lie. */
  let inFlight = 0;
  let inFlightAfterInterview = 0;

  for (const job of jobs) {
    const journey = journeyOf(job.statusHistory);
    if (!journey.applied) {
      continue;
    }
    applied += 1;

    if (journey.interviewed) {
      interviewed += 1;
      if (journey.outcome === null) {
        inFlightAfterInterview += 1;
      } else {
        stage2[journey.outcome] = (stage2[journey.outcome] ?? 0) + 1;
      }
      continue;
    }

    if (journey.outcome === null) {
      inFlight += 1;
      continue;
    }
    stage1[journey.outcome] = (stage1[journey.outcome] ?? 0) + 1;
  }

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];

  if (applied === 0) {
    return {
      nodes,
      links,
      applied: 0,
      interviewed: 0,
      offers: 0,
      rejected: 0,
      ghosted: 0,
    };
  }

  const appliedId = nodeId("applied", 0);
  nodes.push({
    id: appliedId,
    label: LABELS.applied,
    status: "applied",
    stage: 0,
    count: applied,
  });

  if (interviewed > 0) {
    const id = nodeId("interviewing", 1);
    nodes.push({
      id,
      label: LABELS.interviewing,
      status: "interviewing",
      stage: 1,
      count: interviewed,
    });
    links.push({ from: appliedId, to: id, count: interviewed });

    for (const outcome of OUTCOMES) {
      const count = stage2[outcome] ?? 0;
      if (count === 0) {
        continue;
      }
      const outcomeId = nodeId(outcome, 2);
      nodes.push({
        id: outcomeId,
        label: LABELS[outcome],
        status: outcome,
        stage: 2,
        count,
      });
      links.push({ from: id, to: outcomeId, count });
    }
  }

  for (const outcome of OUTCOMES) {
    const count = stage1[outcome] ?? 0;
    if (count === 0) {
      continue;
    }
    const id = nodeId(outcome, 1);
    nodes.push({
      id,
      label: LABELS[outcome],
      status: outcome,
      stage: 1,
      count,
    });
    links.push({ from: appliedId, to: id, count });
  }

  // Deliberately unlinked: an application still waiting has no outcome to point
  // at. It is counted in `applied` — dropping it would understate the top of the
  // funnel — and the ribbons simply do not sum to the source, which is what
  // "still out there" looks like.
  void inFlight;
  void inFlightAfterInterview;

  return {
    nodes,
    links,
    applied,
    interviewed,
    offers: stage2.offer ?? 0,
    rejected: (stage1.rejected ?? 0) + (stage2.rejected ?? 0),
    ghosted: (stage1.ghosted ?? 0) + (stage2.ghosted ?? 0),
  };
}

/**
 * The flow as one line of prose, for the clipboard.
 *
 * **Rates are only stated when their denominator is real.** "0% response rate"
 * off two applications is a number that describes the sample size, not the job
 * search, and a user who copies it into a message is quoting something untrue
 * about themselves.
 */
export function summarizeJobFlow(flow: JobFlow): string {
  if (flow.applied === 0) {
    return "No applications yet.";
  }

  const parts = [`${flow.applied} applied`];
  if (flow.interviewed > 0) {
    parts.push(
      `${flow.interviewed} ${flow.interviewed === 1 ? "interview" : "interviews"}`,
    );
  }
  if (flow.offers > 0) {
    parts.push(`${flow.offers} ${flow.offers === 1 ? "offer" : "offers"}`);
  }
  if (flow.ghosted > 0) {
    parts.push(`${flow.ghosted} with no response`);
  }

  if (flow.applied >= MIN_JOBS_FOR_RATES) {
    const rate = Math.round((flow.interviewed / flow.applied) * 100);
    parts.push(`${rate}% interview rate`);
  }

  return parts.join(" · ");
}

/** Below this, a percentage says more about the sample than the search. */
export const MIN_JOBS_FOR_RATES = 5;
