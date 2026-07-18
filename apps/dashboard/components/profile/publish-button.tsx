"use client";

import { Button, Spinner } from "@resfolio/ui";
import { UploadCloud } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { publishProfileAction } from "@/app/(dashboard)/profile/actions";
import { TEST_IDS } from "@/lib/testids";

import type { SaveStatus } from "./use-profile-autosave";

/**
 * Publish snapshots the current draft into an immutable version
 * (docs/architecture/01-profile-engine.md) — a deliberate action, separate
 * from autosave. Blocked while the draft has unsaved changes so a publish
 * always reflects persisted content; `saveNow` flushes first.
 *
 * **`invalid` is deliberately not a blocked state.** It used to be, which made
 * Publish a dead button at exactly the moment the user most needed to be told
 * *what* was wrong — the only feedback was a greyed control and a status line
 * pointing at highlights that didn't exist. Now the click runs validation and
 * takes them to the first bad field, which is the thing they were trying to
 * find out by clicking.
 */
export function PublishButton({
  status,
  saveNow,
  reviewInvalid,
  initialPublishedVersion,
  hasUnpublishedChanges,
  onPublished,
}: {
  status: SaveStatus;
  saveNow: () => void;
  /** Validates, jumps to the first bad field, and reports whether it's valid. */
  reviewInvalid: () => Promise<boolean>;
  initialPublishedVersion: number | null;
  hasUnpublishedChanges: boolean;
  onPublished: () => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [publishedVersion, setPublishedVersion] = useState(
    initialPublishedVersion,
  );

  const blocked =
    status === "saving" ||
    status === "dirty" ||
    status === "conflict" ||
    status === "offline" ||
    // Nothing new to snapshot — the draft already matches the published version.
    !hasUnpublishedChanges;

  async function publish() {
    if (!(await reviewInvalid())) {
      return;
    }
    saveNow();
    setPublishing(true);
    const pending = toast.loading("Publishing your profile…");
    try {
      const result = await publishProfileAction({});
      if (result.ok) {
        setPublishedVersion(result.data.version);
        onPublished();
        toast.success(`Published · v${result.data.version}`, {
          id: pending,
          description: "Your live resume and portfolio now show this version.",
        });
      } else {
        toast.error("Couldn't publish", {
          id: pending,
          description: result.error,
        });
      }
    } catch {
      toast.error("Couldn't publish", {
        id: pending,
        description: "Publishing didn't complete. Please try again.",
      });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span
        className="text-xs text-muted"
        data-testid={TEST_IDS.profilePublishState}
      >
        {publishedVersion
          ? `Published · v${publishedVersion}`
          : "Not published yet"}
      </span>
      <Button
        type="button"
        size="sm"
        disabled={blocked || publishing}
        onClick={() => void publish()}
        data-testid={TEST_IDS.profilePublishButton}
      >
        {publishing ? <Spinner size="sm" /> : <UploadCloud aria-hidden />}
        Publish
      </Button>
    </div>
  );
}
