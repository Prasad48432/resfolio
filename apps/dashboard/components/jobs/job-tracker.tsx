"use client";

import type { JobStatus } from "@resfolio/job";
import { Button } from "@resfolio/ui";
import { Columns3, Share2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  listJobsAction,
  moveJobAction,
} from "@/app/(dashboard)/jobs/actions";
import type { JobCardView } from "@/lib/jobs";
import { TEST_IDS } from "@/lib/testids";

import { JobBoard } from "./job-board";
import { JobEditSheet } from "./job-edit-sheet";
import { JobFlow } from "./job-flow";

/**
 * The tracker's client half: one list, two views.
 *
 * **The list lives here rather than in either view**, so switching between the
 * board and the flow is a render and not a re-read — and, more importantly, so
 * the two can never disagree. A diagram showing eight interviews beside a column
 * holding seven cards is the kind of contradiction that makes a user distrust
 * both numbers, and the surest way to produce one is to let each view fetch its
 * own copy.
 *
 * **Moves are optimistic, and that is the lesson from the Sources triage board.**
 * That one used to `await` the action and *then* `router.refresh()` before the
 * row moved: two sequential round trips, the second a full RSC re-render, which
 * locally is instant and in production is a serverless invocation plus a managed
 * Postgres. The work was never slow — it was serialised behind the wrong event.
 * Here the card lands in the new column on drop, the action follows, and a
 * failure re-reads the truth rather than guessing at an undo.
 */
export function JobTracker({ initialJobs }: { initialJobs: JobCardView[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [view, setView] = useState<"board" | "flow">("board");
  const [editing, setEditing] = useState<JobCardView | null>(null);

  const move = useCallback(
    async (jobId: string, status: JobStatus) => {
      const before = jobs;
      const job = before.find((entry) => entry.id === jobId);
      if (!job || job.status === status) {
        return;
      }

      // The card moves now. Its journey gains the same hop the server is about
      // to record, so the flow view agrees with the board without waiting for a
      // read.
      setJobs((current) =>
        current.map((entry) =>
          entry.id === jobId
            ? { ...entry, status, journey: [...entry.journey, status] }
            : entry,
        ),
      );

      const result = await moveJobAction({ jobId, status });
      if (result.ok) {
        return;
      }

      // Re-read rather than restore. A local rollback assumes nothing else moved
      // in the meantime, and the common cause of a failure here is the job
      // having been deleted in another tab — in which case putting the card back
      // is the wrong correction. `before` is the fallback for a failed re-read.
      toast.error("Couldn't move that job", { description: result.error });
      const fresh = await listJobsAction({});
      setJobs(fresh.ok ? fresh.data.jobs : before);
    },
    [jobs],
  );

  const applyEdit = useCallback((job: JobCardView) => {
    setJobs((current) =>
      current.map((entry) => (entry.id === job.id ? job : entry)),
    );
  }, []);

  const applyDelete = useCallback((jobId: string) => {
    setJobs((current) => current.filter((entry) => entry.id !== jobId));
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid={TEST_IDS.jobTracker}>
      {/* Two buttons rather than a Select: there are exactly two views, and a
          dropdown to choose between two things costs a click to reveal a choice
          that fits on screen. */}
      <div
        className="flex w-fit items-center gap-1 rounded-lg border border-border p-0.5"
        role="tablist"
        aria-label="Tracker view"
      >
        <ViewTab
          icon={Columns3}
          label="Board"
          active={view === "board"}
          onSelect={() => setView("board")}
          testId={TEST_IDS.jobTrackerViewBoard}
        />
        <ViewTab
          icon={Share2}
          label="Flow"
          active={view === "flow"}
          onSelect={() => setView("flow")}
          testId={TEST_IDS.jobTrackerViewFlow}
        />
      </div>

      {view === "board" ? (
        <JobBoard jobs={jobs} onMove={move} onEdit={setEditing} />
      ) : (
        <JobFlow jobs={jobs} />
      )}

      <JobEditSheet
        job={editing}
        onClose={() => setEditing(null)}
        onSaved={applyEdit}
        onDeleted={applyDelete}
      />
    </div>
  );
}

function ViewTab({
  icon: Icon,
  label,
  active,
  onSelect,
  testId,
}: {
  icon: typeof Columns3;
  label: string;
  active: boolean;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <Button
      type="button"
      role="tab"
      aria-selected={active}
      size="sm"
      variant={active ? "secondary" : "ghost"}
      className={active ? undefined : "text-muted"}
      onClick={onSelect}
      data-testid={testId}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </Button>
  );
}
