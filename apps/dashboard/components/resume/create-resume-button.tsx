"use client";

import { Button } from "@resfolio/ui";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createResumeAction } from "@/app/(dashboard)/resumes/actions";
import { TEST_IDS } from "@/lib/testids";

/**
 * Creates a resume document, then navigates straight into its editor
 * (docs/architecture/08-dashboard-ux.md — the editor is where the work
 * happens). The first resume gets a friendly default name.
 */
export function CreateResumeButton({ hasExisting }: { hasExisting: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        {creating ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Plus aria-hidden />
        )}
        New resume
      </Button>
      {error ? (
        <span className="text-xs text-accent" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
