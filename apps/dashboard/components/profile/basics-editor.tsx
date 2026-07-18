"use client";

import { BASICS_FIELDS, type ProfileFormValues } from "@/lib/profile-form";

import { FieldInput } from "./field-input";
import { LinksEditor } from "./links-editor";

/**
 * The Basics block — name, summary, contacts, links
 * (docs/architecture/01-profile-engine.md). Always present (not an array
 * section), so it renders a flat field grid rather than a SectionEditor.
 */
export function BasicsEditor() {
  return (
    <section className="flex flex-col gap-4" aria-labelledby="section-basics">
      <div>
        <h3
          id="section-basics"
          className="text-sm font-semibold text-foreground"
        >
          Basics
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          The header of every resume and portfolio you generate.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {BASICS_FIELDS.map((field) => (
          <div
            key={field.name}
            className={field.wide ? "sm:col-span-2" : undefined}
          >
            <FieldInput<ProfileFormValues> basePath="basics" field={field} />
          </div>
        ))}
      </div>
      <LinksEditor />
    </section>
  );
}
