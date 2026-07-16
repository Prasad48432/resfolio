"use client";

import { Button } from "@resfolio/ui";
import { Loader2, UploadCloud } from "lucide-react";
import { useState } from "react";

import { publishProfileAction } from "@/app/(dashboard)/profile/actions";
import { TEST_IDS } from "@/lib/testids";

import type { SaveStatus } from "./use-profile-autosave";

/**
 * Publish snapshots the current draft into an immutable version
 * (docs/architecture/01-profile-engine.md) — a deliberate action, separate
 * from autosave. Blocked while the draft has unsaved or unsavable changes so
 * a publish always reflects persisted content; `saveNow` flushes first.
 */
export function PublishButton({
  status,
  saveNow,
  initialPublishedVersion,
  hasUnpublishedChanges,
  onPublished,
}: {
  status: SaveStatus;
  saveNow: () => void;
  initialPublishedVersion: number | null;
  hasUnpublishedChanges: boolean;
  onPublished: () => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [publishedVersion, setPublishedVersion] = useState(
    initialPublishedVersion,
  );
  const [error, setError] = useState<string | null>(null);

  const blocked =
    status === "saving" ||
    status === "dirty" ||
    status === "invalid" ||
    status === "conflict" ||
    status === "offline" ||
    // Nothing new to snapshot — the draft already matches the published version.
    !hasUnpublishedChanges;

  async function publish() {
    setError(null);
    saveNow();
    setPublishing(true);
    try {
      const result = await publishProfileAction({});
      if (result.ok) {
        setPublishedVersion(result.data.version);
        onPublished();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Publishing didn't complete. Please try again.");
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
        {publishing ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <UploadCloud aria-hidden />
        )}
        Publish
      </Button>
      {error ? (
        <span className="text-xs text-accent" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
