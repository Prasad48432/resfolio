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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@resfolio/ui";
import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { EmptyState } from "@/components/layout/empty-state";
import {
  rowTitle,
  readField,
  type ProfileFormValues,
  type SectionConfig,
} from "@/lib/profile-form";
import {
  profileAddItemTestId,
  profileItemTestId,
  profileRemoveItemTestId,
  profileSectionTestId,
} from "@/lib/testids";

import { FieldInput } from "./field-input";
import { SortableItem } from "./sortable-item";

/**
 * A schema-driven, reorderable section of the profile editor
 * (docs/architecture/08-dashboard-ux.md). One instance per standard section;
 * the item fields come from the section's descriptor list. Drag-reorder maps
 * to RHF's `move` (mirrors the domain `moveItem` helper); add/remove map to
 * `append`/`remove`. Item ids come from the domain (`createItemId`) via the
 * config's `makeBlank`, so they're stable and never reused.
 */
export function SectionEditor({
  config,
  projected,
}: {
  config: SectionConfig;
  /**
   * Read-only rows rendered above the editable ones — content the section
   * shows but does not own. Writing uses it for natively authored blog posts,
   * which are projected in at read time and edited at `/blog`. Kept as a slot
   * rather than a `blog` prop so this component stays section-agnostic.
   */
  projected?: ReactNode;
}) {
  const { control } = useFormContext<ProfileFormValues>();
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: `sections.${config.key}`,
  });
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((field) => field.id === active.id);
    const to = fields.findIndex((field) => field.id === over.id);
    if (from !== -1 && to !== -1) move(from, to);
  }

  function addItem() {
    const blank = config.makeBlank();
    append(blank as never);
    setJustAddedId(String(blank["id"]));
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby={`section-${config.key}`}
      data-testid={profileSectionTestId(config.key)}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3
            id={`section-${config.key}`}
            className="text-sm font-semibold text-foreground"
          >
            {config.title}
          </h3>
          <p className="mt-0.5 text-xs text-muted">{config.hint}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addItem}
          data-testid={profileAddItemTestId(config.key)}
        >
          <Plus aria-hidden />
          Add {config.singular}
        </Button>
      </div>

      {projected}

      {fields.length === 0 ? (
        // Only genuinely empty when nothing is projected either — a Writing
        // section carrying three published posts is not "no writing yet".
        projected ? null : (
          <EmptyState
            size="inline"
            title={`No ${config.title.toLowerCase()} yet.`}
          />
        )
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={fields.map((field) => field.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {fields.map((field, index) => {
                const item = field as unknown as Record<string, unknown>;
                return (
                  <SortableItem
                    key={field.id}
                    id={field.id}
                    title={rowTitle(config, item)}
                    subtitle={
                      config.subtitleField
                        ? readField(item, config.subtitleField)
                        : undefined
                    }
                    defaultOpen={field.id === justAddedId}
                    onRemove={() => remove(index)}
                    removeLabel={`Remove ${config.singular}`}
                    testId={profileItemTestId(config.key, index)}
                    removeTestId={profileRemoveItemTestId(config.key, index)}
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {config.fields.map((fieldDescriptor) => (
                        <div
                          key={fieldDescriptor.name}
                          className={
                            fieldDescriptor.wide ? "sm:col-span-2" : undefined
                          }
                        >
                          <FieldInput<ProfileFormValues>
                            basePath={`sections.${config.key}.${index}`}
                            field={fieldDescriptor}
                          />
                        </div>
                      ))}
                    </div>
                  </SortableItem>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
