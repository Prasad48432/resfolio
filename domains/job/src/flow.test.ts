import { describe, expect, it } from "vitest";

import { buildJobFlow, summarizeJobFlow, type JobFlow } from "./flow";
import type { JobMatchSummary, JobStatus } from "./match";

/**
 * The tests that matter most here are the ones a *snapshot* would pass and this
 * function must not: rejected-after-interview against rejected-outright, and an
 * offer that never interviewed. Those are the two claims the whole reason for
 * `status_history` rests on, and both are invisible to the `status` column.
 */

let clock = 0;
/** Monotonic, because order is the only thing `journeyOf` reads. */
function at(): Date {
  clock += 1_000;
  return new Date(clock);
}

function job(...statuses: JobStatus[]): JobMatchSummary {
  const last = statuses.at(-1) ?? "saved";
  return {
    id: `job-${statuses.join("-")}-${clock}`,
    title: "Engineer at Acme",
    role: "Engineer",
    company: "Acme",
    location: null,
    jobUrl: null,
    status: last,
    initialScore: null,
    enhancedScore: null,
    hasResume: false,
    hasCoverLetter: false,
    hasEnhancement: false,
    resumeDocumentId: null,
    statusHistory: statuses.map((status) => ({ status, at: at() })),
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function link(flow: JobFlow, from: string, to: string): number {
  return flow.links.find((l) => l.from === from && l.to === to)?.count ?? 0;
}

describe("buildJobFlow", () => {
  it("separates a rejection after an interview from one before it", () => {
    const flow = buildJobFlow([
      job("saved", "applied", "interviewing", "rejected"),
      job("saved", "applied", "rejected"),
    ]);

    // The whole point: same final status, two different stories, two different
    // ribbons. A flow built from the `status` column could only draw one.
    expect(link(flow, "0:applied", "1:rejected")).toBe(1);
    expect(link(flow, "0:applied", "1:interviewing")).toBe(1);
    expect(link(flow, "1:interviewing", "2:rejected")).toBe(1);
    expect(flow.rejected).toBe(2);
  });

  it("does not invent an interview for an offer that never had one", () => {
    const flow = buildJobFlow([job("saved", "applied", "offer")]);

    expect(flow.interviewed).toBe(0);
    expect(flow.nodes.some((node) => node.status === "interviewing")).toBe(
      false,
    );
    expect(link(flow, "0:applied", "1:offer")).toBe(1);
  });

  it("counts an interview as an application even when Applied was skipped", () => {
    // Dragging a card straight from Saved to Interviewing is a thing people do.
    // The interview certainly happened, so dropping the row would understate the
    // funnel worse than assuming the application did too.
    const flow = buildJobFlow([job("saved", "interviewing", "offer")]);

    expect(flow.applied).toBe(1);
    expect(flow.interviewed).toBe(1);
    expect(flow.offers).toBe(1);
  });

  it("leaves saved jobs out entirely", () => {
    // A posting you read and never applied to is a bookmark. Counting bookmarks
    // in a funnel makes every rate below it look worse than it is.
    const flow = buildJobFlow([job("saved"), job("saved")]);

    expect(flow.applied).toBe(0);
    expect(flow.nodes).toHaveLength(0);
    expect(flow.links).toHaveLength(0);
  });

  it("counts an application still in flight without drawing a ribbon to nothing", () => {
    const flow = buildJobFlow([job("saved", "applied")]);

    expect(flow.applied).toBe(1);
    expect(flow.links).toHaveLength(0);
    expect(flow.nodes).toHaveLength(1);
  });

  it("reopens a job that went back to applied after a rejection", () => {
    const flow = buildJobFlow([
      job("saved", "applied", "rejected", "applied", "interviewing"),
    ]);

    expect(flow.rejected).toBe(0);
    expect(flow.interviewed).toBe(1);
    expect(link(flow, "0:applied", "1:rejected")).toBe(0);
  });

  it("draws a pre-history row from its synthesised single event", () => {
    // What `readStatusHistory` hands back for a row written before the column
    // existed: one hop, true by construction.
    const legacy = job("interviewing");
    const flow = buildJobFlow([legacy]);

    expect(flow.applied).toBe(1);
    expect(flow.interviewed).toBe(1);
  });

  it("emits no zero-count node", () => {
    const flow = buildJobFlow([
      job("saved", "applied", "interviewing", "offer"),
      job("saved", "applied", "ghosted"),
    ]);

    expect(flow.nodes.every((node) => node.count > 0)).toBe(true);
    expect(flow.links.every((edge) => edge.count > 0)).toBe(true);
    expect(flow.nodes.some((node) => node.status === "rejected")).toBe(false);
  });

  it("keeps ghosted apart from rejected", () => {
    const flow = buildJobFlow([
      job("saved", "applied", "ghosted"),
      job("saved", "applied", "ghosted"),
      job("saved", "applied", "rejected"),
    ]);

    expect(flow.ghosted).toBe(2);
    expect(flow.rejected).toBe(1);
  });

  it("reproduces the reference funnel", () => {
    const jobs = [
      ...Array.from({ length: 25 }, () => job("applied", "ghosted")),
      ...Array.from({ length: 15 }, () => job("applied", "rejected")),
      ...Array.from({ length: 2 }, () =>
        job("applied", "interviewing", "offer"),
      ),
      ...Array.from({ length: 6 }, () =>
        job("applied", "interviewing", "rejected"),
      ),
    ];

    const flow = buildJobFlow(jobs);

    expect(flow.applied).toBe(48);
    expect(flow.interviewed).toBe(8);
    expect(link(flow, "0:applied", "1:ghosted")).toBe(25);
    expect(link(flow, "0:applied", "1:rejected")).toBe(15);
    expect(link(flow, "1:interviewing", "2:offer")).toBe(2);
    expect(link(flow, "1:interviewing", "2:rejected")).toBe(6);
  });
});

describe("summarizeJobFlow", () => {
  it("says nothing about rates when the sample cannot support one", () => {
    // "0% interview rate" off two applications describes the sample size, not
    // the job search — and the user is about to paste it somewhere.
    const line = summarizeJobFlow(buildJobFlow([job("applied"), job("applied")]));

    expect(line).toBe("2 applied");
    expect(line).not.toContain("%");
  });

  it("states a rate once the denominator is real", () => {
    const jobs = [
      ...Array.from({ length: 8 }, () => job("applied", "ghosted")),
      ...Array.from({ length: 2 }, () => job("applied", "interviewing")),
    ];

    expect(summarizeJobFlow(buildJobFlow(jobs))).toBe(
      "10 applied · 2 interviews · 8 with no response · 20% interview rate",
    );
  });

  it("singularises one of each", () => {
    expect(
      summarizeJobFlow(buildJobFlow([job("applied", "interviewing", "offer")])),
    ).toBe("1 applied · 1 interview · 1 offer");
  });

  it("has something to say about an empty tracker", () => {
    expect(summarizeJobFlow(buildJobFlow([]))).toBe("No applications yet.");
  });
});
