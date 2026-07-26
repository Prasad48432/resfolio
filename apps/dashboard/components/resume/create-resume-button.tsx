"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Spinner,
  cn,
} from "@resfolio/ui";
import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createResumeAction } from "@/app/(dashboard)/resumes/actions";
import type { ResumeTemplateChoice } from "@/lib/resume-templates";
import { TEST_IDS } from "@/lib/testids";

import { ResumeThumbnail } from "./resume-thumbnail";

/**
 * Picks a template, creates a resume on it, then navigates into the editor
 * (docs/architecture/08-dashboard-ux.md). Resumes are one-per-template (enforced
 * in the document domain), so each template appears once and a template already
 * in use is shown checked and disabled — the picker doubles as "which looks do I
 * already have?". When every template is used the trigger is disabled with a
 * note; the server still rejects a duplicate as the authoritative backstop.
 *
 * The picker is a **dialog of visual cards** (A4 thumbnail + name + description),
 * not a text dropdown: a template is a *look*, so choosing one should show the
 * look. The thumbnails are the same placeholder used on the list, so the picker
 * and the list read as one surface.
 */
export function CreateResumeButton({
  templates,
  usedTemplateIds,
}: {
  templates: readonly ResumeTemplateChoice[];
  usedTemplateIds: readonly string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const used = new Set(usedTemplateIds);
  const allUsed = templates.every((template) => used.has(template.id));

  async function create(template: ResumeTemplateChoice) {
    setError(null);
    setCreating(template.id);
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
        setCreating(null);
      }
    } catch {
      setError("Couldn't create the resume. Please try again.");
      setCreating(null);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          data-testid={TEST_IDS.resumeCreateButton}
        >
          <Plus aria-hidden />
          New resume
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogTitle>Choose a template</DialogTitle>
        <DialogDescription>
          Each template is a different look, rendered live from your profile.
          You can create one resume per template.
        </DialogDescription>

        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((template) => {
            const inUse = used.has(template.id);
            const isCreating = creating === template.id;
            const variant =
              template.id === "resume-editorial" ? "editorial" : "classic";
            return (
              <button
                key={template.id}
                type="button"
                disabled={inUse || creating !== null}
                onClick={() => void create(template)}
                aria-busy={isCreating}
                className={cn(
                  "flex items-stretch gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-[border-color,background-color] duration-(--duration-press) ease-out",
                  inUse
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:border-brand/40 disabled:cursor-wait",
                )}
                data-testid={TEST_IDS.resumeTemplateOption(template.id)}
              >
                <ResumeThumbnail
                  variant={variant}
                  className="w-18 shrink-0 rounded-md border border-border"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {template.name}
                    </span>
                    {isCreating ? (
                      <Spinner size="sm" />
                    ) : inUse ? (
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <Check className="size-3.5" aria-hidden />
                        Created
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs leading-relaxed text-muted">
                    {inUse ? "Already created" : template.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {error ? (
          <span className="text-xs text-brand" role="alert">
            {error}
          </span>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
