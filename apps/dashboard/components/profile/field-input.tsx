"use client";

import { Input, Label, Textarea } from "@resfolio/ui";
import { useId } from "react";
import {
  useFormContext,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import type { FieldDescriptor } from "@/lib/profile-form";

import { HighlightsField } from "./highlights-field";
import { TagsField } from "./tags-field";

const INPUT_TYPE: Partial<Record<FieldDescriptor["kind"], string>> = {
  url: "url",
  email: "email",
  tel: "tel",
};

/**
 * Renders one schema field descriptor bound to the enclosing React Hook Form
 * (docs/architecture/08-dashboard-ux.md — schema-driven form). `basePath` is
 * the RHF path to the item (e.g. `sections.experience.3`); the descriptor's
 * `name` is appended. Free-text/URL/date fields register directly; array
 * fields delegate to their own controlled sub-editors.
 */
export function FieldInput<TValues extends FieldValues>({
  basePath,
  field,
}: {
  basePath: string;
  field: FieldDescriptor;
}) {
  const form = useFormContext<TValues>();
  const id = useId();
  const path = (
    basePath ? `${basePath}.${field.name}` : field.name
  ) as FieldPath<TValues>;

  if (field.kind === "tags") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <TagsField id={id} name={path} placeholder={field.placeholder} />
      </div>
    );
  }

  if (field.kind === "highlights") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>{field.label}</Label>
        <HighlightsField name={path} />
      </div>
    );
  }

  const isMultiline = field.kind === "textarea" || field.kind === "richtext";

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      {isMultiline ? (
        <Textarea
          id={id}
          placeholder={field.placeholder}
          data-testid={field.testId}
          {...form.register(path)}
        />
      ) : (
        <Input
          id={id}
          type={INPUT_TYPE[field.kind] ?? "text"}
          placeholder={field.placeholder}
          data-testid={field.testId}
          {...form.register(path)}
        />
      )}
      {field.kind === "richtext" ? (
        <p className="text-[11px] text-muted/80">
          Markdown: **bold**, _italic_, [links](https://…).
        </p>
      ) : null}
    </div>
  );
}
