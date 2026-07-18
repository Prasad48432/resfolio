"use client";

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@resfolio/ui";

import { ImageUpload } from "@/components/upload/image-upload";
import type { ConfigFieldDescriptor } from "@/lib/config-form";
import { portfolioConfigFieldTestId } from "@/lib/testids";

/**
 * Renders a template's settings form from the field descriptors
 * `describeConfigSchema` produced (docs/architecture/03-portfolio-rendering.md).
 * Generic over field kind — a new config option surfaces here with no code
 * change. Presentation only; content is edited at `/profile`.
 */
export function ConfigFields({
  fields,
  config,
  onChange,
}: {
  fields: ConfigFieldDescriptor[];
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {fields.map((field) => (
        <ConfigField
          key={field.key}
          field={field}
          value={config[field.key]}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

/** Label + optional help text + the required mark, shared by every control so
 * the three can't drift apart per field kind. */
function FieldLabel({
  field,
  htmlFor,
}: {
  field: ConfigFieldDescriptor;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label htmlFor={htmlFor}>
        {field.label}
        {field.required ? (
          <span className="ml-1 text-brand" aria-hidden>
            *
          </span>
        ) : null}
        {field.required ? <span className="sr-only"> (required)</span> : null}
      </Label>
      {field.description ? (
        <p className="text-xs text-muted">{field.description}</p>
      ) : null}
    </div>
  );
}

function ConfigField({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldDescriptor;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const testId = portfolioConfigFieldTestId(field.key);
  const id = `portfolio-config-${field.key}`;
  const missing = field.required && !String(value ?? "").trim();

  switch (field.kind) {
    case "boolean":
      return (
        <label className="flex items-center justify-between gap-4 text-sm text-foreground">
          <span className="flex flex-col gap-0.5">
            <span>{field.label}</span>
            {field.description ? (
              <span className="text-xs text-muted">{field.description}</span>
            ) : null}
          </span>
          <Switch
            checked={Boolean(value ?? field.defaultValue)}
            onChange={(event) => onChange(field.key, event.target.checked)}
            data-testid={testId}
          />
        </label>
      );

    case "select":
      return (
        <div className="flex flex-col gap-1.5">
          <FieldLabel field={field} htmlFor={id} />
          <Select
            value={String(value ?? field.defaultValue)}
            onValueChange={(next) => onChange(field.key, next)}
          >
            <SelectTrigger id={id} data-testid={testId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case "number":
      return (
        <div className="flex flex-col gap-1.5">
          <FieldLabel field={field} htmlFor={id} />
          <Input
            id={id}
            type="number"
            min={field.min}
            max={field.max}
            value={Number(value ?? field.defaultValue)}
            onChange={(event) => {
              const next = event.target.valueAsNumber;
              onChange(
                field.key,
                Number.isNaN(next) ? field.defaultValue : next,
              );
            }}
            className="w-28"
            data-testid={testId}
          />
        </div>
      );

    case "color":
      return (
        <div className="flex flex-col gap-1.5">
          <FieldLabel field={field} htmlFor={id} />
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="color"
              value={String(value ?? field.defaultValue)}
              onChange={(event) => onChange(field.key, event.target.value)}
              className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1"
              data-testid={testId}
              aria-label={field.label}
            />
            <Input
              value={String(value ?? field.defaultValue)}
              onChange={(event) => onChange(field.key, event.target.value)}
              spellCheck={false}
              className="w-32 font-mono text-sm"
              aria-label={`${field.label} hex value`}
            />
          </div>
        </div>
      );

    // An upload, never a pasted URL (doc 07). The template declares the
    // dimensions it is designed around; the uploader reports them and the
    // server resizes to fit, so "1200×260" is guidance the user cannot get
    // wrong rather than a measurement we were never able to take.
    case "image":
      return (
        <div className="flex flex-col gap-1.5">
          <FieldLabel field={field} htmlFor={id} />
          <ImageUpload
            id={id}
            kind="portfolioBanner"
            value={String(value ?? field.defaultValue)}
            onChange={(url) => onChange(field.key, url)}
            invalid={missing}
            testId={testId}
            recommended={field.image}
          />
        </div>
      );

    case "textarea":
      return (
        <div className="flex flex-col gap-1.5">
          <FieldLabel field={field} htmlFor={id} />
          <Textarea
            id={id}
            rows={3}
            value={String(value ?? field.defaultValue)}
            onChange={(event) => onChange(field.key, event.target.value)}
            aria-invalid={missing || undefined}
            data-testid={testId}
          />
        </div>
      );

    case "url":
      return (
        <div className="flex flex-col gap-1.5">
          <FieldLabel field={field} htmlFor={id} />
          <Input
            id={id}
            type="url"
            placeholder="https://…"
            value={String(value ?? field.defaultValue)}
            onChange={(event) => onChange(field.key, event.target.value)}
            aria-invalid={missing || undefined}
            data-testid={testId}
          />
        </div>
      );

    case "text":
      return (
        <div className="flex flex-col gap-1.5">
          <FieldLabel field={field} htmlFor={id} />
          <Input
            id={id}
            value={String(value ?? field.defaultValue)}
            onChange={(event) => onChange(field.key, event.target.value)}
            aria-invalid={missing || undefined}
            data-testid={testId}
          />
        </div>
      );

    default:
      return null;
  }
}
