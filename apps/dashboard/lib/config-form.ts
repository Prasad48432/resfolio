import type { z } from "zod";

/**
 * Turn a template's Zod `configSchema` into a flat list of form-field
 * descriptors, so the portfolio settings form is generated from the schema
 * (docs/architecture/03-portfolio-rendering.md) — a template adding a config
 * option never requires a dashboard change. Pure + unit-tested; the client
 * `ConfigFields` component renders whatever this returns.
 *
 * We introspect Zod v4 internals (`.def`) rather than depend on template-side
 * form metadata: config stays presentation knobs the template owns, and the
 * dashboard stays generic over any registered template. Only the handful of
 * field shapes our templates actually use are supported; an unknown shape is
 * skipped (never guessed) so the form degrades safely.
 */

export type ConfigFieldDescriptor =
  | { key: string; label: string; kind: "color"; defaultValue: string }
  | { key: string; label: string; kind: "text"; defaultValue: string }
  | {
      key: string;
      label: string;
      kind: "select";
      options: string[];
      defaultValue: string;
    }
  | { key: string; label: string; kind: "boolean"; defaultValue: boolean }
  | {
      key: string;
      label: string;
      kind: "number";
      min?: number;
      max?: number;
      defaultValue: number;
    };

/** `featuredProjectCount` → "Featured project count". */
function humanize(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Minimal structural views over Zod v4's `.def` — we read only what we need and
// never assume beyond the shapes our templates produce.
interface ZodDef {
  type: string;
  innerType?: { def: ZodDef };
  defaultValue?: unknown;
  entries?: Record<string, unknown>;
  checks?: { _zod?: { def?: ZodCheck }; def?: ZodCheck }[];
  pattern?: RegExp;
}
interface ZodCheck {
  check?: string;
  format?: string;
  value?: number;
  inclusive?: boolean;
  pattern?: RegExp;
}

function unwrap(def: ZodDef): { def: ZodDef; defaultValue: unknown } {
  let current = def;
  let defaultValue: unknown;
  while (
    current.type === "default" ||
    current.type === "optional" ||
    current.type === "nullable"
  ) {
    if (current.type === "default") {
      defaultValue = current.defaultValue;
    }
    if (!current.innerType) break;
    current = current.innerType.def;
  }
  return { def: current, defaultValue };
}

function checkDef(check: {
  _zod?: { def?: ZodCheck };
  def?: ZodCheck;
}): ZodCheck {
  return check._zod?.def ?? check.def ?? {};
}

/** A hex-color string field (regex over `0-9a-f`) reads as a color picker. */
function looksLikeColor(def: ZodDef): boolean {
  for (const check of def.checks ?? []) {
    const cd = checkDef(check);
    const source = cd.pattern?.source ?? def.pattern?.source ?? "";
    if (/0-9a-f/i.test(source)) {
      return true;
    }
  }
  return false;
}

function numberBounds(def: ZodDef): { min?: number; max?: number } {
  let min: number | undefined;
  let max: number | undefined;
  for (const check of def.checks ?? []) {
    const cd = checkDef(check);
    if (cd.check === "greater_than" && typeof cd.value === "number") {
      min = cd.inclusive ? cd.value : cd.value + 1;
    }
    if (cd.check === "less_than" && typeof cd.value === "number") {
      max = cd.inclusive ? cd.value : cd.value - 1;
    }
  }
  return { min, max };
}

export function describeConfigSchema(
  schema: z.ZodObject<z.ZodRawShape>,
): ConfigFieldDescriptor[] {
  const shape = schema.shape;
  const fields: ConfigFieldDescriptor[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const outerDef = (value as unknown as { def: ZodDef }).def;
    const { def, defaultValue } = unwrap(outerDef);
    const label = humanize(key);

    switch (def.type) {
      case "enum": {
        const options = Object.keys(def.entries ?? {});
        fields.push({
          key,
          label,
          kind: "select",
          options,
          defaultValue: String(defaultValue ?? options[0] ?? ""),
        });
        break;
      }
      case "boolean":
        fields.push({
          key,
          label,
          kind: "boolean",
          defaultValue: Boolean(defaultValue),
        });
        break;
      case "number": {
        const { min, max } = numberBounds(def);
        fields.push({
          key,
          label,
          kind: "number",
          min,
          max,
          defaultValue: typeof defaultValue === "number" ? defaultValue : 0,
        });
        break;
      }
      case "string":
        fields.push({
          key,
          label,
          kind: looksLikeColor(def) ? "color" : "text",
          defaultValue: typeof defaultValue === "string" ? defaultValue : "",
        });
        break;
      default:
        // Unknown shape — skip rather than guess (the form degrades safely).
        break;
    }
  }

  return fields;
}
