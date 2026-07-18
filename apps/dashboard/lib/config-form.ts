import type {
  ConfigFieldMeta,
  TemplateRequirements,
} from "@resfolio/template-sdk";
import type { z } from "zod";

/**
 * Turn a template's Zod `configSchema` into a flat list of form-field
 * descriptors, so the portfolio settings form is generated from the schema
 * (docs/architecture/03-portfolio-rendering.md) — a template adding a config
 * option never requires a dashboard change. Pure + unit-tested; the client
 * `ConfigFields` component renders whatever this returns.
 *
 * **Introspection first, metadata only where introspection can't reach.** We
 * read Zod v4 internals (`.def`) rather than depend on template-side form
 * metadata: config stays presentation knobs the template owns, and the
 * dashboard stays generic over any registered template. But a schema genuinely
 * cannot say some things — a `z.string().url()` cover image is indistinguishable
 * from any other URL, and "1600×900" is advice, not validation — so a template
 * may add `configFields` hints (`ConfigFieldMeta`) that are merged over the
 * inferred shape. Only the field shapes our templates actually use are
 * supported; an unknown shape is skipped (never guessed) so the form degrades
 * safely.
 */

interface FieldBase {
  key: string;
  label: string;
  /** Help text under the control (template-declared). */
  description?: string;
  /** Declared in `requirements.config` — the site can't publish without it. */
  required?: boolean;
}

export type ConfigFieldDescriptor =
  | (FieldBase & { kind: "color"; defaultValue: string })
  | (FieldBase & { kind: "text"; defaultValue: string })
  | (FieldBase & { kind: "textarea"; defaultValue: string })
  | (FieldBase & { kind: "url"; defaultValue: string })
  | (FieldBase & {
      kind: "image";
      defaultValue: string;
      /** The dimensions the template is designed around — guidance, not a rule:
       * we can't measure a pasted URL. */
      image?: { width: number; height: number };
    })
  | (FieldBase & {
      kind: "select";
      options: string[];
      defaultValue: string;
    })
  | (FieldBase & { kind: "boolean"; defaultValue: boolean })
  | (FieldBase & {
      kind: "number";
      min?: number;
      max?: number;
      defaultValue: number;
    });

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

export interface DescribeConfigOptions {
  /** Template-declared presentation hints, merged over the inferred shape. */
  configFields?: Readonly<Record<string, ConfigFieldMeta>>;
  /** Template-declared requirements; `requirements.config` marks fields required. */
  requirements?: TemplateRequirements;
}

export function describeConfigSchema(
  schema: z.ZodObject<z.ZodRawShape>,
  options: DescribeConfigOptions = {},
): ConfigFieldDescriptor[] {
  const shape = schema.shape;
  const fields: ConfigFieldDescriptor[] = [];
  const requiredKeys = new Set(options.requirements?.config ?? []);

  for (const [key, value] of Object.entries(shape)) {
    const outerDef = (value as unknown as { def: ZodDef }).def;
    const { def, defaultValue } = unwrap(outerDef);
    const meta = options.configFields?.[key];
    const base: FieldBase = {
      key,
      label: meta?.label ?? humanize(key),
      description: meta?.description,
      required: requiredKeys.has(key) || undefined,
    };

    // Metadata wins over introspection, and is checked *before* it: a declared
    // kind is the template telling us something the schema cannot. A cover
    // image is `z.union([z.literal(""), z.url()])` — an unknown shape that the
    // switch below would rightly skip — and no amount of `.def` reading would
    // ever reveal that it's an image.
    const stringDefault = typeof defaultValue === "string" ? defaultValue : "";
    if (meta?.kind === "image") {
      fields.push({
        ...base,
        kind: "image",
        image: meta.image,
        defaultValue: stringDefault,
      });
      continue;
    }
    if (meta?.kind === "textarea") {
      fields.push({ ...base, kind: "textarea", defaultValue: stringDefault });
      continue;
    }
    if (meta?.kind === "url") {
      fields.push({ ...base, kind: "url", defaultValue: stringDefault });
      continue;
    }

    switch (def.type) {
      case "enum": {
        const options_ = Object.keys(def.entries ?? {});
        fields.push({
          ...base,
          kind: "select",
          options: options_,
          defaultValue: String(defaultValue ?? options_[0] ?? ""),
        });
        break;
      }
      case "boolean":
        fields.push({
          ...base,
          kind: "boolean",
          defaultValue: Boolean(defaultValue),
        });
        break;
      case "number": {
        const { min, max } = numberBounds(def);
        fields.push({
          ...base,
          kind: "number",
          min,
          max,
          defaultValue: typeof defaultValue === "number" ? defaultValue : 0,
        });
        break;
      }
      case "string":
        fields.push({
          ...base,
          kind: looksLikeColor(def) ? "color" : "text",
          defaultValue: stringDefault,
        });
        break;
      default:
        // Unknown shape — skip rather than guess (the form degrades safely).
        break;
    }
  }

  return fields;
}

/**
 * Label a `MissingRequirement` for the completeness prompt. Config keys reuse
 * the form's own labels so the prompt and the field agree; profile keys get a
 * plain-English name and the page that fixes them.
 */
export function describeMissing(
  missing: { scope: "config" | "profile"; key: string },
  fields: ConfigFieldDescriptor[],
): { label: string; where: "settings" | "profile" } {
  if (missing.scope === "config") {
    const field = fields.find((entry) => entry.key === missing.key);
    return { label: field?.label ?? humanize(missing.key), where: "settings" };
  }
  return {
    label: PROFILE_REQUIREMENT_LABELS[missing.key] ?? missing.key,
    where: "profile",
  };
}

const PROFILE_REQUIREMENT_LABELS: Record<string, string> = {
  "basics.name": "Your name",
  "basics.summary": "Summary",
  "basics.location": "Location",
  "basics.avatarUrl": "Avatar",
  "basics.links": "At least one link",
  "sections.experience": "At least one role in Experience",
  "sections.projects": "At least one project",
  "sections.skills": "At least one skill group",
  "sections.education": "At least one entry in Education",
  "sections.writing": "At least one post in Writing",
  "sections.certifications": "At least one certification",
  "sections.awards": "At least one award",
  "sections.languages": "At least one language",
  "sections.custom": "At least one custom section",
};
