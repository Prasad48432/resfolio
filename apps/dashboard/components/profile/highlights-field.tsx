"use client";

import { Button, Textarea } from "@resfolio/ui";
import { Plus, X } from "lucide-react";
import {
  useController,
  useFormContext,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

/**
 * Controlled editor for a rich-text `string[]` field (highlights): one
 * textarea per bullet, add/remove. Managed through `useController` rather
 * than `useFieldArray` — the field is an array of bare strings, not objects.
 * Empty bullets are tolerated while editing and dropped by
 * `buildProfileView` at render time.
 */
export function HighlightsField<TValues extends FieldValues>({
  name,
}: {
  name: FieldPath<TValues>;
}) {
  const { control } = useFormContext<TValues>();
  const { field } = useController({ control, name });
  const value = Array.isArray(field.value) ? (field.value as string[]) : [];

  function update(next: string[]) {
    field.onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      {value.map((entry, index) => (
        <div key={index} className="flex items-start gap-2">
          <Textarea
            className="min-h-10"
            value={entry}
            onChange={(event) =>
              update(
                value.map((v, i) => (i === index ? event.target.value : v)),
              )
            }
            onBlur={field.onBlur}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove highlight"
            onClick={() => update(value.filter((_, i) => i !== index))}
          >
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => update([...value, ""])}
        >
          <Plus aria-hidden />
          Add highlight
        </Button>
      </div>
    </div>
  );
}
