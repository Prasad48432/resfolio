"use client";

import { TagInput } from "@resfolio/ui";
import {
  useController,
  useFormContext,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

/**
 * Controlled editor for a `string[]` field (skills, technologies) — the
 * dashboard's reusable pattern for string arrays. Binds the shared `TagInput`
 * chip editor to the enclosing React Hook Form: Enter or comma commits a
 * trimmed, deduplicated tag; each chip has a remove button. The pending
 * (uncommitted) text lives inside `TagInput`, so the form — and autosave —
 * only ever see the committed `string[]`.
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
    <TagInput
      id={id}
      value={value}
      onChange={field.onChange}
      onBlur={field.onBlur}
      placeholder={placeholder ?? "Type a skill, press Enter"}
    />
  );
}
