"use client";

import { Button, Input, Label } from "@resfolio/ui";
import { Plus, X } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { createItemId } from "@resfolio/profile";

import type { ProfileFormValues } from "@/lib/profile-form";

/**
 * Basics links (label + URL pairs) — GitHub, LinkedIn, personal site, etc.
 * URLs are validated at the schema boundary (http/https/mailto only, doc 10).
 */
export function LinksEditor() {
  const { control, register } = useFormContext<ProfileFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "basics.links",
  });

  return (
    <div className="flex flex-col gap-2">
      <Label>Links</Label>
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-center gap-2">
          <Input
            className="w-40 shrink-0"
            placeholder="Label"
            {...register(`basics.links.${index}.label`)}
          />
          <Input
            type="url"
            placeholder="https://…"
            {...register(`basics.links.${index}.url`)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove link"
            onClick={() => remove(index)}
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
          onClick={() => append({ id: createItemId(), label: "", url: "" })}
        >
          <Plus aria-hidden />
          Add link
        </Button>
      </div>
    </div>
  );
}
