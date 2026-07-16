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
} from "@resfolio/ui";

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

  switch (field.kind) {
    case "boolean":
      return (
        <label className="flex items-center justify-between gap-4 text-sm text-foreground">
          <span>{field.label}</span>
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
          <Label htmlFor={id}>{field.label}</Label>
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
          <Label htmlFor={id}>{field.label}</Label>
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
          <Label htmlFor={id}>{field.label}</Label>
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

    case "text":
      return (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{field.label}</Label>
          <Input
            id={id}
            value={String(value ?? field.defaultValue)}
            onChange={(event) => onChange(field.key, event.target.value)}
            data-testid={testId}
          />
        </div>
      );

    default:
      return null;
  }
}
