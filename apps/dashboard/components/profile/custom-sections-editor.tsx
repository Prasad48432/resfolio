"use client";

import { Button, Input } from "@resfolio/ui";
import { Plus, X } from "lucide-react";
import {
  useFieldArray,
  useFormContext,
  type UseFieldArrayRemove,
} from "react-hook-form";

import {
  CUSTOM_ITEM_FIELDS,
  makeBlankCustomItem,
  makeBlankCustomSection,
  type ProfileFormValues,
} from "@/lib/profile-form";
import { profileAddItemTestId, profileSectionTestId } from "@/lib/testids";

import { FieldInput } from "./field-input";

/**
 * Custom sections (docs/architecture/01-profile-engine.md — custom sections
 * exist from day one so the schema never blocks a user). Add/remove/title a
 * section, then add/remove entries within it. Reorder of custom entries is
 * intentionally out of scope for Phase 3 (the standard sections prove the
 * drag primitive); it slots in later without a data change.
 */
function CustomSectionCard({
  index,
  onRemove,
}: {
  index: number;
  onRemove: UseFieldArrayRemove;
}) {
  const { control, register } = useFormContext<ProfileFormValues>();
  const items = useFieldArray({
    control,
    name: `sections.custom.${index}.items`,
  });

  return (
    <div className="card-surface flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Input
          className="font-medium"
          placeholder="Section title (e.g. Talks)"
          {...register(`sections.custom.${index}.title`)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Remove section"
          onClick={() => onRemove(index)}
        >
          <X aria-hidden />
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {items.fields.map((field, itemIndex) => (
          <div key={field.id} className="rounded-xl border border-border p-3">
            <div className="mb-2 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove entry"
                onClick={() => items.remove(itemIndex)}
              >
                <X aria-hidden />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {CUSTOM_ITEM_FIELDS.map((fieldDescriptor) => (
                <div
                  key={fieldDescriptor.name}
                  className={fieldDescriptor.wide ? "sm:col-span-2" : undefined}
                >
                  <FieldInput<ProfileFormValues>
                    basePath={`sections.custom.${index}.items.${itemIndex}`}
                    field={fieldDescriptor}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => items.append(makeBlankCustomItem() as never)}
          >
            <Plus aria-hidden />
            Add entry
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CustomSectionsEditor() {
  const { control } = useFormContext<ProfileFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "sections.custom",
  });

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="section-custom"
      data-testid={profileSectionTestId("custom")}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3
            id="section-custom"
            className="text-sm font-semibold text-foreground"
          >
            Custom sections
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Anything the standard sections don&rsquo;t cover.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => append(makeBlankCustomSection() as never)}
          data-testid={profileAddItemTestId("custom")}
        >
          <Plus aria-hidden />
          Add section
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted">
          No custom sections yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <CustomSectionCard key={field.id} index={index} onRemove={remove} />
          ))}
        </div>
      )}
    </section>
  );
}
