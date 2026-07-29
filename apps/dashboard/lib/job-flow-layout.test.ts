import { buildJobFlow, type JobStatus } from "@resfolio/job";
import { describe, expect, it } from "vitest";

import { layoutJobFlow, VIEW_HEIGHT, VIEW_WIDTH } from "./job-flow-layout";

/**
 * Geometry you cannot test is geometry that renders wrong somewhere nobody
 * looks — the same reason `lib/pdf/cover-letter-layout.ts` is split from the
 * drawing beside it. A ribbon a few pixels outside the viewBox is invisible in
 * the browser and present in the PNG the user sends to somebody.
 */

function jobs(...journeys: JobStatus[][]) {
  return journeys.map((journey) => ({
    statusHistory: journey.map((status) => ({ status })),
  }));
}

const flowOf = (...journeys: JobStatus[][]) =>
  layoutJobFlow(buildJobFlow(jobs(...journeys)));

describe("layoutJobFlow", () => {
  it("draws nothing for an empty flow", () => {
    const layout = layoutJobFlow(buildJobFlow([]));
    expect(layout.nodes).toHaveLength(0);
    expect(layout.links).toHaveLength(0);
  });

  it("keeps every node inside the viewBox", () => {
    const layout = flowOf(
      ...Array.from({ length: 30 }, (): JobStatus[] => ["applied", "ghosted"]),
      ...Array.from({ length: 12 }, (): JobStatus[] => ["applied", "rejected"]),
      ["applied", "interviewing", "offer"],
      ["applied", "interviewing", "rejected"],
      ["applied"],
    );

    expect(layout.nodes.length).toBeGreaterThan(0);
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + node.width).toBeLessThanOrEqual(VIEW_WIDTH);
      expect(node.y + node.height).toBeLessThanOrEqual(VIEW_HEIGHT);
    }
  });

  it("gives a single application a node tall enough to see and click", () => {
    // One job out of fifty is a real row. Drawn strictly proportionally it
    // would be a hairline with a label floating beside it.
    const layout = flowOf(
      ...Array.from({ length: 50 }, (): JobStatus[] => ["applied", "ghosted"]),
      ["applied", "interviewing", "offer"],
    );

    const offer = layout.nodes.find((node) => node.status === "offer");
    expect(offer?.height).toBeGreaterThanOrEqual(10);
  });

  it("scales heights with counts", () => {
    const layout = flowOf(
      ...Array.from({ length: 20 }, (): JobStatus[] => ["applied", "ghosted"]),
      ...Array.from({ length: 5 }, (): JobStatus[] => ["applied", "rejected"]),
    );

    const ghosted = layout.nodes.find((node) => node.status === "ghosted");
    const rejected = layout.nodes.find((node) => node.status === "rejected");
    expect(ghosted?.height).toBeGreaterThan(rejected?.height ?? 0);
  });

  it("puts each stage further right than the last", () => {
    const layout = flowOf(["applied", "interviewing", "offer"]);
    const byStage = [0, 1, 2].map(
      (stage) => layout.nodes.find((node) => node.stage === stage)?.x ?? -1,
    );

    expect(byStage[0]).toBeLessThan(byStage[1] ?? 0);
    expect(byStage[1]).toBeLessThan(byStage[2] ?? 0);
  });

  it("anchors the last column's labels inward", () => {
    // Otherwise they run off the right edge — which is invisible on screen
    // because the container clips, and is a cropped word in the export.
    const layout = flowOf(["applied", "interviewing", "offer"]);
    const last = layout.nodes.find((node) => node.stage === 2);

    expect(last?.labelAnchor).toBe("end");
    expect(last?.labelX).toBeLessThan(last?.x ?? 0);
  });

  it("emits one closed path per link", () => {
    const layout = flowOf(
      ["applied", "interviewing", "offer"],
      ["applied", "rejected"],
    );

    expect(layout.links).toHaveLength(3);
    for (const link of layout.links) {
      expect(link.path.startsWith("M ")).toBe(true);
      expect(link.path.endsWith("Z")).toBe(true);
      expect(link.path).not.toContain("NaN");
    }
  });

  it("stacks ribbons leaving one node instead of overlapping them", () => {
    const layout = flowOf(
      ["applied", "interviewing"],
      ["applied", "rejected"],
      ["applied", "ghosted"],
    );

    // Each ribbon starts below the last: three overlapping bands read as one
    // thick one and the picture stops meaning anything.
    const starts = layout.links
      .filter((link) => link.from === "0:applied")
      .map((link) => Number(link.path.split(" ")[2]));

    expect(starts).toHaveLength(3);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});
