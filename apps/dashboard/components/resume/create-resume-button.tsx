"use client";

import { Button, Spinner } from "@resfolio/ui";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createResumeAction } from "@/app/(dashboard)/resumes/actions";
import { TEST_IDS } from "@/lib/testids";

/**
 * Creates a resume document, then navigates straight into its editor
 * (docs/architecture/08-dashboard-ux.md — the editor is where the work
 * happens). The first resume gets a friendly default name.
 *
 * Resumes are one-per-template (enforced in the document domain). When every
 * available template is already used, `canCreate` is false and the button is a
 * disabled affordance that explains why — the server still rejects a duplicate
 * as the authoritative backstop.
 */
export function CreateResumeButton({
  hasExisting,
  canCreate,
}: {
  hasExisting: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canCreate) {
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
          You already have a resume using this template. Edit your existing
          resume instead.
        </span>
      </div>
    );
  }

  async function create() {
    setError(null);
    setCreating(true);
    try {
      const name = hasExisting ? "Untitled resume" : "My resume";
      const result = await createResumeAction({ name });
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

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        disabled={creating}
        onClick={() => void create()}
        data-testid={TEST_IDS.resumeCreateButton}
      >
        {creating ? <Spinner size="sm" /> : <Plus aria-hidden />}
        New resume
      </Button>
      {error ? (
        <span className="text-xs text-brand" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
