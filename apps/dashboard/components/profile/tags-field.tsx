"use client";

import { Input } from "@resfolio/ui";
import {
  useController,
  useFormContext,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

/**
 * Controlled editor for a `string[]` field (skills, technologies): a single
 * comma-separated input. Stored as a trimmed array; empty entries are kept
 * out. `buildProfileView` also tidies empties, so mid-edit states are safe.
 */
export function TagsField<TValues extends FieldValues>({
  id,
  name,
  placeholder,
}: {
  id?: string;
  name: FieldPath<TValues>;
  placeholder?: string;
}) {
  const { control } = useFormContext<TValues>();
  const { field } = useController({ control, name });
  const value = Array.isArray(field.value) ? (field.value as string[]) : [];

  return (
    <Input
      id={id}
      value={value.join(", ")}
      placeholder={placeholder ?? "Comma, separated, values"}
      onChange={(event) =>
        field.onChange(
          event.target.value
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
        )
      }
      onBlur={field.onBlur}
    />
  );
}
