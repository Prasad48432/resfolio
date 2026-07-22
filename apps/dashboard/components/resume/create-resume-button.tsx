"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from "@resfolio/ui";
import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createResumeAction } from "@/app/(dashboard)/resumes/actions";
import type { ResumeTemplateChoice } from "@/lib/resume-templates";
import { TEST_IDS } from "@/lib/testids";

/**
 * Picks a template, creates a resume on it, then navigates into the editor
 * (docs/architecture/08-dashboard-ux.md). Resumes are one-per-template (enforced
 * in the document domain), so each template appears once and a template already
 * in use is shown checked and disabled — the menu doubles as "which looks do I
 * already have?". When every template is used the trigger is disabled with a
 * note; the server still rejects a duplicate as the authoritative backstop.
 */
export function CreateResumeButton({
  templates,
  usedTemplateIds,
}: {
  templates: readonly ResumeTemplateChoice[];
  usedTemplateIds: readonly string[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const used = new Set(usedTemplateIds);
  const allUsed = templates.every((template) => used.has(template.id));

  async function create(template: ResumeTemplateChoice) {
    setError(null);
    setCreating(true);
    try {
      // A friendly first name; later resumes name themselves after the template.
      const name =
        usedTemplateIds.length === 0 ? "My resume" : `${template.name} resume`;
      const result = await createResumeAction({
        name,
        templateId: template.id,
      });
      if (result.ok) {
        router.push(`/resumes/${result.data.id}`);
      } else {
        setError(result.error);
        setCreating(false);
      }
    } catch {
      setError("Couldn't create the resume. Please try again.");
      setCreating(false);
    }
  }

  if (allUsed) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          size="sm"
          disabled
          data-testid={TEST_IDS.resumeCreateButton}
        >
          <Plus aria-hidden />
          New resume
        </Button>
        <span className="max-w-[16rem] text-right text-xs text-muted">
          You already have a resume on every template. Edit an existing one
          instead.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            disabled={creating}
            data-testid={TEST_IDS.resumeCreateButton}
          >
            {creating ? <Spinner size="sm" /> : <Plus aria-hidden />}
            New resume
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {templates.map((template) => {
            const inUse = used.has(template.id);
            return (
              <DropdownMenuItem
                key={template.id}
                disabled={inUse}
                onSelect={() => {
                  if (!inUse) void create(template);
                }}
                className="flex-col items-start gap-0.5"
                data-testid={TEST_IDS.resumeTemplateOption(template.id)}
              >
                <span className="flex w-full items-center justify-between gap-2 text-sm font-medium">
                  {template.name}
                  {inUse ? (
                    <Check className="size-3.5 text-muted" aria-hidden />
                  ) : null}
                </span>
                <span className="text-xs text-muted">
                  {inUse ? "Already created" : template.description}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <span className="text-xs text-brand" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
