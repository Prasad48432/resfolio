"use client";

import { JOB_STATUSES, type JobStatus } from "@resfolio/job";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState } from "react";

import { STATUS_ACCENTS, STATUS_LABELS, type JobCardView } from "@/lib/jobs";
import { jobColumnTestId, TEST_IDS } from "@/lib/testids";

import { JobCard } from "./job-card";

/**
 * The board: six columns, one per tracker state.
 *
 * **Columns are rendered from `JOB_STATUSES`**, the domain's own array, in its
 * order — not from a second list here. A board whose columns are declared
 * locally is a board that silently loses a column the day someone adds a state,
 * and every card in it becomes invisible rather than mis-sorted, which is the
 * worse of the two failures.
 *
 * ## Drag and drop
 *
 * `@dnd-kit/core` was already a dependency (the profile and resume editors use
 * `@dnd-kit/sortable` for their vertical lists). This is the repository's first
 * *cross-container* drag, and it deliberately does not use `sortable`: there is
 * no position column on a job, so ordering within a column would be a thing the
 * user could arrange and the database could not remember. Cards are draggable,
 * columns are droppable, order is by recent activity.
 *
 * Three things not to change without knowing why:
 *
 * - **The `DndContext` carries an explicit `id`.** dnd-kit generates aria ids
 *   from a counter; two contexts that both default collide, and the repository
 *   has already been bitten by that in `resume-sections.tsx`.
 * - **`KeyboardSensor` is not optional.** A board that can only be operated by
 *   dragging is a board a keyboard user cannot use at all — and it is also the
 *   only way a Playwright spec can drive a move, since synthesised pointer
 *   events do not reliably reproduce a drag.
 * - **The horizontal scroll is here, not on the page.** The shell's content
 *   region is `grid-cols-[minmax(0,1fr)]` specifically so a wide child cannot
 *   size the whole page; six columns must scroll inside their own box or they
 *   push the page header off the right edge of a phone.
 */
export function JobBoard({
  jobs,
  onMove,
  onEdit,
}: {
  jobs: JobCardView[];
  onMove: (jobId: string, status: JobStatus) => void;
  onEdit: (job: JobCardView) => void;
}) {
  const [dragging, setDragging] = useState<JobCardView | null>(null);

  const sensors = useSensors(
    // A small distance before a drag starts, so a click on the card (which opens
    // the edit sheet) is not swallowed by a one-pixel mouse movement.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setDragging(jobs.find((job) => job.id === id) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const over = event.over;
    if (!over) {
      return;
    }
    const status = String(over.id) as JobStatus;
    if (!(JOB_STATUSES as readonly string[]).includes(status)) {
      return;
    }
    onMove(String(event.active.id), status);
  }

  return (
    <DndContext
      id="job-board"
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div
        className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2"
        data-testid={TEST_IDS.jobBoard}
      >
        {JOB_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            jobs={jobs.filter((job) => job.status === status)}
            onEdit={onEdit}
          />
        ))}
      </div>

      {/* The one place in this app a shadow is right: a row lifted mid-drag is
          exactly the "genuinely elevated" case the design system reserves it
          for. */}
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="w-64 rotate-1 shadow-lg">
            <JobCard job={dragging} onEdit={() => {}} overlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  jobs,
  onEdit,
}: {
  status: JobStatus;
  jobs: JobCardView[];
  onEdit: (job: JobCardView) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      // `w-64 shrink-0`: columns keep their width and the row scrolls. Letting
      // them shrink to fit six on a laptop gives six columns too narrow to read
      // a job title in, which is the only thing a card is for.
      className={`flex w-64 shrink-0 flex-col gap-2 rounded-xl border p-2 transition-colors duration-(--duration-fast) ease-out ${
        isOver ? "border-brand/50 bg-brand/5" : "border-border bg-surface-warm/40"
      }`}
      data-testid={jobColumnTestId(status)}
      aria-label={STATUS_LABELS[status]}
    >
      <header className="flex items-center gap-2 px-1">
        <span
          className={`size-1.5 shrink-0 rounded-full ${STATUS_ACCENTS[status]}`}
          aria-hidden
        />
        <h2 className="label-section">{STATUS_LABELS[status]}</h2>
        <span className="ml-auto text-xs text-muted tabular-nums">
          {jobs.length}
        </span>
      </header>

      <div className="flex min-h-16 flex-col gap-2">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} onEdit={onEdit} />
        ))}
        {jobs.length === 0 ? (
          // A column with nothing in it still has to look like a place a card
          // can go, or the drop target reads as disabled.
          <p className="px-1 py-3 text-xs text-muted">Drop a job here.</p>
        ) : null}
      </div>
    </section>
  );
}
