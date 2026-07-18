"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Profile, SectionKey, ViewDefinition } from "@resfolio/profile";
import { Checkbox, Switch, cn } from "@resfolio/ui";
import { GripVertical } from "lucide-react";
import Link from "next/link";

import {
  isItemShown,
  isSectionIncluded,
  orderedChoices,
  orderedSections,
  sectionItemChoices,
  setItemOrder,
  setItemShown,
  setSectionIncluded,
  setSectionOrder,
  shownCount,
  type SectionItemChoice,
} from "@/lib/resume-sections";
import {
  resumeSectionDragTestId,
  resumeSectionItemTestId,
  resumeSectionToggleTestId,
  TEST_IDS,
} from "@/lib/testids";

/**
 * The resume's configuration layer (docs/architecture/01-profile-engine.md,
 * 02-resume-rendering.md). A **lightweight** control surface, deliberately not
 * a second editor: it decides what this resume shows, never what the content
 * is. Every field here writes a `ViewDefinition`, which `buildProfileView`
 * already knew how to read — the preview beside it runs that exact function.
 *
 * Name, contact, links and summary have no controls at all: they are
 * `basics` fields, and a resume without them isn't one. Experience and
 * Education can't be hidden for the same reason — but they **can** be
 * reordered: `locked` is about visibility, never position.
 *
 * The list renders in `orderedSections(view)` — the true render order, mirroring
 * what `buildProfileView` does — so the panel always agrees with the preview
 * beside it.
 */
export function ResumeSections({
  profile,
  view,
  onChange,
}: {
  profile: Profile;
  view: ViewDefinition;
  onChange: (next: ViewDefinition) => void;
}) {
  const sections = orderedSections(view);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const keys = sections.map((section) => section.key);
    const from = keys.indexOf(active.id as SectionKey);
    const to = keys.indexOf(over.id as SectionKey);
    if (from === -1 || to === -1) return;
    const next = [...keys];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(setSectionOrder(view, next));
  }

  return (
    <div className="flex flex-col gap-6" data-testid={TEST_IDS.resumeSections}>
      <div className="flex flex-col gap-1">
        <p className="label-section">Sections</p>
        <p className="text-sm text-muted">
          Drag to reorder. Choose what this resume shows — edit the content
          itself in your{" "}
          <Link href="/profile" className="text-brand hover:underline">
            profile
          </Link>
          .
        </p>
      </div>

      {/* `id` is required: this DndContext nests one per section for the item
          lists, and dnd-kit's generated aria ids would otherwise collide. */}
      <DndContext
        id="resume-section-order"
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onSectionDragEnd}
      >
        <SortableContext
          items={sections.map((section) => section.key)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-3">
            {sections.map((section) => (
              <SectionRow
                key={section.key}
                sectionKey={section.key}
                label={section.label}
                locked={section.locked ?? false}
                profile={profile}
                view={view}
                onChange={onChange}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SectionRow({
  sectionKey,
  label,
  locked,
  profile,
  view,
  onChange,
}: {
  sectionKey: SectionKey;
  label: string;
  locked: boolean;
  profile: Profile;
  view: ViewDefinition;
  onChange: (next: ViewDefinition) => void;
}) {
  const choices = sectionItemChoices(profile, sectionKey);
  const included = isSectionIncluded(view, sectionKey);
  const ordered = orderedChoices(view, sectionKey, choices);
  const shown = shownCount(view, sectionKey, choices);
  const empty = choices.length === 0;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sectionKey });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = ordered.map((choice) => choice.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(setItemOrder(view, sectionKey, next));
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-xl border border-border bg-surface",
        isDragging && "relative z-10 shadow-md",
      )}
    >
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <button
          type="button"
          className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted transition-colors duration-(--duration-press) ease-out hover:bg-surface-warm hover:text-foreground active:cursor-grabbing"
          aria-label={`Reorder ${label}`}
          data-testid={resumeSectionDragTestId(sectionKey)}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" aria-hidden />
        </button>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm text-foreground">{label}</span>
          <span className="text-xs text-muted">
            {empty
              ? "Nothing added yet"
              : locked
                ? "Always shown"
                : !included
                  ? `${choices.length} hidden`
                  : shown === choices.length
                    ? `All ${choices.length} shown`
                    : `${shown} of ${choices.length} shown`}
          </span>
        </div>

        {/* Locked sections keep their drag handle but get no switch: a resume
            without your work history isn't a resume, so the toggle would only
            ever be a way to break your own document. */}
        {locked ? null : (
          <Switch
            checked={included && !empty}
            disabled={empty}
            onChange={(event) =>
              onChange(
                setSectionIncluded(view, sectionKey, event.target.checked),
              )
            }
            aria-label={`Show ${label}`}
            data-testid={resumeSectionToggleTestId(sectionKey)}
          />
        )}
      </div>

      {/* The picker only appears when there is a choice to make: one item has
          nothing to select between and nothing to reorder. */}
      {included && choices.length > 1 ? (
        <div className="border-t border-border px-3 py-2.5">
          <DndContext
            id={`resume-items-${sectionKey}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={ordered.map((choice) => choice.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-0.5">
                {ordered.map((choice) => (
                  <ItemRow
                    key={choice.id}
                    choice={choice}
                    sectionKey={sectionKey}
                    shown={isItemShown(view, sectionKey, choice.id)}
                    onToggle={(next) =>
                      onChange(setItemShown(view, sectionKey, choice.id, next))
                    }
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      ) : null}
    </li>
  );
}

function ItemRow({
  choice,
  sectionKey,
  shown,
  onToggle,
}: {
  choice: SectionItemChoice;
  sectionKey: SectionKey;
  shown: boolean;
  onToggle: (shown: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: choice.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1.5 rounded-lg py-1",
        isDragging && "relative z-10 bg-surface",
      )}
      data-testid={resumeSectionItemTestId(sectionKey, choice.id)}
    >
      <button
        type="button"
        className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted transition-colors duration-(--duration-press) ease-out hover:bg-surface-warm hover:text-foreground active:cursor-grabbing"
        aria-label={`Reorder ${choice.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>

      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 transition-colors duration-(--duration-press) ease-out hover:bg-surface-warm">
        <Checkbox
          checked={shown}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate text-sm",
              shown ? "text-foreground" : "text-muted line-through",
            )}
          >
            {choice.label}
          </span>
          {choice.detail ? (
            <span className="block truncate text-xs text-muted">
              {choice.detail}
            </span>
          ) : null}
        </span>
      </label>
    </li>
  );
}
