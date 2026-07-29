"use client";

import { buildJobFlow, summarizeJobFlow, type JobStatus } from "@resfolio/job";
import { Button, Card } from "@resfolio/ui";
import { Copy, Download, Share2 } from "lucide-react";
import { useMemo, useRef } from "react";
import { toast } from "sonner";

import { layoutJobFlow } from "@/lib/job-flow-layout";
import type { JobCardView } from "@/lib/jobs";
import { TEST_IDS } from "@/lib/testids";

import { copyFlowSummary, downloadFlowPng, downloadFlowSvg } from "./job-flow-export";

/**
 * The job search, drawn.
 *
 * **Built in the browser from the same list the board renders** — `buildJobFlow`
 * lives in `@resfolio/job`'s pure root, so it runs here without pulling in a
 * database client. That is what lets a card dragged into Interviewing show up in
 * this diagram immediately, rather than after a navigation. A flow that could
 * only be computed on the server would contradict the column the user had just
 * dropped into.
 *
 * **Hand-drawn SVG over a tested layout** (`lib/job-flow-layout.ts`), not a
 * charting library: there is none in this workspace and this shape does not earn
 * the first one — three stages, at most seven nodes, no crossing edges. Colours
 * are token utilities on the elements, which is also what makes the export
 * work: `currentColor` and CSS variables both resolve at serialisation time.
 */

/** Ribbon and node fills, per status. Deliberately quiet — a wall of red beside
 * fifteen rejections is a chart telling someone how to feel about their own job
 * search. Only an offer gets a colour of its own. */
const FILLS: Record<JobStatus, string> = {
  saved: "fill-muted",
  applied: "fill-brand",
  interviewing: "fill-brand",
  offer: "fill-live",
  rejected: "fill-muted",
  ghosted: "fill-muted",
};

export function JobFlow({ jobs }: { jobs: JobCardView[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  const flow = useMemo(
    () => buildJobFlow(jobs.map((job) => ({ statusHistory: journeyOf(job) }))),
    [jobs],
  );
  const layout = useMemo(() => layoutJobFlow(flow), [flow]);
  const summary = useMemo(() => summarizeJobFlow(flow), [flow]);

  if (flow.applied === 0) {
    return (
      <Card
        className="flex flex-col gap-2 p-6 text-center"
        data-testid={TEST_IDS.jobFlowEmpty}
      >
        <Share2 className="mx-auto size-5 text-muted" aria-hidden />
        <p className="text-[13px] font-medium">Nothing to draw yet</p>
        <p className="text-xs text-muted">
          Move a job to Applied and the flow starts here. Saved jobs are a
          shortlist, so they stay out of it — counting them would make every
          rate below look worse than it is.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid={TEST_IDS.jobFlow}>
      <Card className="flex flex-col gap-3 p-4">
        {/* The diagram scrolls inside its own box on a narrow screen rather than
            shrinking to unreadable. Same rule as the board. */}
        <div className="-mx-1 overflow-x-auto px-1">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            width="100%"
            // A minimum, so the labels stay legible on a phone and the box
            // scrolls instead.
            className="min-w-[36rem]"
            role="img"
            aria-label={summary}
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Ribbons under nodes: a ribbon meets its node edge-to-edge, and
                drawing it on top would put a translucent band over the solid
                bar it is supposed to be flowing out of. */}
            <g>
              {layout.links.map((link) => {
                const target = layout.nodes.find(
                  (node) => node.id === link.to,
                );
                return (
                  <path
                    key={`${link.from}->${link.to}`}
                    d={link.path}
                    className={target ? FILLS[target.status] : "fill-muted"}
                    fillOpacity={0.18}
                  />
                );
              })}
            </g>

            <g>
              {layout.nodes.map((node) => (
                <g key={node.id}>
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx={3}
                    className={FILLS[node.status]}
                    fillOpacity={0.85}
                  />
                  {/* `fill-current` so the label follows the theme's text
                      colour — this diagram is read in light and dark. */}
                  <text
                    x={node.labelX}
                    y={node.labelY}
                    textAnchor={node.labelAnchor}
                    dominantBaseline="middle"
                    className="fill-current text-[13px]"
                    fontSize={13}
                  >
                    {node.label}
                    <tspan className="fill-current" fontWeight={600}>
                      {" "}
                      {node.count}
                    </tspan>
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </div>

        <p
          className="text-xs text-muted tabular-nums"
          data-testid={TEST_IDS.jobFlowSummary}
        >
          {summary}
        </p>
      </Card>

      {/* Export, not a share link. This names the companies that rejected you;
          a public URL for it is a decision worth taking on its own, so what
          ships is a file you choose where to send. */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void downloadFlowPng(svgRef.current)}
          data-testid={TEST_IDS.jobFlowExportPng}
        >
          <Download className="size-3.5" aria-hidden />
          PNG
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => downloadFlowSvg(svgRef.current)}
          data-testid={TEST_IDS.jobFlowExportSvg}
        >
          <Download className="size-3.5" aria-hidden />
          SVG
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            void copyFlowSummary(summary).then((ok) => {
              if (ok) {
                toast.success("Summary copied");
              } else {
                toast.error("Couldn't copy that");
              }
            });
          }}
          data-testid={TEST_IDS.jobFlowCopy}
        >
          <Copy className="size-3.5" aria-hidden />
          Copy summary
        </Button>
      </div>
    </div>
  );
}

/** The card's `journey` in the shape `buildJobFlow` asks for. A one-line map
 * rather than storing the objects on the DTO: the domain reads the sequence and
 * never the timestamps, so shipping dates to the browser would be serialising
 * values nothing looks at. */
function journeyOf(job: JobCardView): { status: JobStatus }[] {
  return job.journey.map((status) => ({ status }));
}
