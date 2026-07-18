"use client";

import { Input, Label, MonthYearPicker, Textarea } from "@resfolio/ui";
import { useId } from "react";
import {
  useController,
  useFormContext,
  useFormState,
  useWatch,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { ImageUpload } from "@/components/upload/image-upload";
import { boundsFor } from "@/lib/month-year";
import type { FieldDescriptor } from "@/lib/profile-form";

import { HighlightsField } from "./highlights-field";
import { TagsField } from "./tags-field";

const INPUT_TYPE: Partial<Record<FieldDescriptor["kind"], string>> = {
  url: "url",
  email: "email",
  tel: "tel",
};

/**
 * Two grammars, two hints. `richtext` is the long-form fields (a role, a
 * project) where a bulleted list is the natural shape; `richtextInline` is
 * short prose like the summary, where the domain schema rejects bullets
 * outright — so advertising `- list item` there would document a feature that
 * fails validation.
 */
const MARKDOWN_HELP: Partial<Record<FieldDescriptor["kind"], string>> = {
  richtext: "Markdown: **bold**, _italic_, [links](https://…), - list item",
  richtextInline: "Markdown: **bold**, _italic_, [links](https://…)",
};

/**
 * Renders one schema field descriptor bound to the enclosing React Hook Form
 * (docs/architecture/08-dashboard-ux.md — schema-driven form). `basePath` is
 * the RHF path to the item (e.g. `sections.experience.3`); the descriptor's
 * `name` is appended. Free-text/URL fields register directly; dates get the
 * month/year picker; array fields delegate to their own sub-editors.
 *
 * **Every field surfaces its own error.** The save indicator says "check
 * highlighted fields", and until this component read `formState` that sentence
 * was a lie — the resolver computed errors that nothing rendered. Errors are
 * subscribed per-field via `useFormState({ name })` so one invalid entry
 * re-renders one field rather than the entire profile form.
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

  // `useFormState` provides the *subscription* (so this field re-renders when
  // its own error changes); `getFieldState` provides the *lookup* by dotted
  // path, which is the only public way to index RHF's nested error tree.
  const formState = useFormState({ control: form.control, name: path });
  const message = form.getFieldState(path, formState).error?.message;
  const errorId = message ? `${id}-error` : undefined;

  const control = renderControl();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      {control}
      {message ? (
        <p id={errorId} role="alert" className="text-[11px] text-destructive">
          {message}
        </p>
      ) : MARKDOWN_HELP[field.kind] ? (
        <p className="text-[11px] text-muted/80">{MARKDOWN_HELP[field.kind]}</p>
      ) : null}
    </div>
  );

  function renderControl() {
    if (field.kind === "tags") {
      return <TagsField id={id} name={path} placeholder={field.placeholder} />;
    }

    if (field.kind === "highlights") {
      return <HighlightsField name={path} />;
    }

    if (field.kind === "image") {
      return <ImageField id={id} path={path} invalid={Boolean(message)} />;
    }

    if (field.kind === "date") {
      return (
        <DateField
          id={id}
          path={path}
          basePath={basePath}
          field={field}
          invalid={Boolean(message)}
          describedBy={errorId}
        />
      );
    }

    const shared = {
      id,
      placeholder: field.placeholder,
      "data-testid": field.testId,
      "aria-invalid": message ? (true as const) : undefined,
      "aria-describedby": errorId,
      ...form.register(path),
    };

    return field.kind === "textarea" ||
      field.kind === "richtext" ||
      field.kind === "richtextInline" ? (
      <Textarea rows={4} {...shared} />
    ) : (
      <Input {...shared} type={INPUT_TYPE[field.kind] ?? "text"} />
    );
  }
}

/**
 * An uploaded image bound to the form (doc 07).
 *
 * `useController` rather than `register`: the uploader is not an `<input>` the
 * form can read a value off — it produces a URL out of band — so the value has
 * to be written through RHF explicitly. Empty is written as `undefined`, not
 * `""`, because the profile schema treats an absent avatar as absent and an
 * empty string would fail URL validation.
 */
function ImageField<TValues extends FieldValues>({
  id,
  path,
  invalid,
}: {
  id: string;
  path: FieldPath<TValues>;
  invalid: boolean;
}) {
  const form = useFormContext<TValues>();
  const { field: controlled } = useController({
    control: form.control,
    name: path,
  });

  return (
    <ImageUpload
      id={id}
      kind="avatar"
      value={typeof controlled.value === "string" ? controlled.value : ""}
      onChange={(url) => controlled.onChange(url === "" ? undefined : url)}
      invalid={invalid}
    />
  );
}

/**
 * A month/year field, bounded by its sibling. `useWatch` on the sibling means
 * changing a start date immediately re-restricts the end picker — the bound is
 * live, not captured at mount.
 *
 * `data-field` carries the RHF path because the picker's trigger is a
 * `<button>` with no `name` attribute, and `focusField` (the jump-to-first-
 * error helper) looks controls up by name.
 */
function DateField<TValues extends FieldValues>({
  id,
  path,
  basePath,
  field,
  invalid,
  describedBy,
}: {
  id: string;
  path: FieldPath<TValues>;
  basePath: string;
  field: FieldDescriptor;
  invalid: boolean;
  describedBy?: string;
}) {
  const form = useFormContext<TValues>();
  const { field: controlled } = useController({
    control: form.control,
    name: path,
  });

  const siblingPath = field.dateBound
    ? ((basePath
        ? `${basePath}.${field.dateBound.field}`
        : field.dateBound.field) as FieldPath<TValues>)
    : undefined;

  // `useWatch` is called unconditionally with a possibly-undefined name: hooks
  // may not be conditional, and RHF treats an undefined name as "watch all",
  // so the sibling path is applied only where it exists.
  const siblingValue = useWatch({
    control: form.control,
    name: siblingPath as FieldPath<TValues>,
    disabled: !siblingPath,
  });

  const { min, max } = field.dateBound
    ? boundsFor(field.dateBound.direction, siblingValue)
    : {};

  return (
    <MonthYearPicker
      id={id}
      data-field={path}
      data-testid={field.testId}
      value={typeof controlled.value === "string" ? controlled.value : ""}
      onChange={(next) => controlled.onChange(next === "" ? undefined : next)}
      onBlur={controlled.onBlur}
      min={min}
      max={max}
      allowPresent={field.present ?? false}
      invalid={invalid}
      aria-describedby={describedBy}
    />
  );
}
