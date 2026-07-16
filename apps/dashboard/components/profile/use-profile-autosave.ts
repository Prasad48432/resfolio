"use client";

import { profileSchema, type Profile } from "@resfolio/profile";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";

import { saveProfileDraftAction } from "@/app/(dashboard)/profile/actions";
import type { ProfileFormValues } from "@/lib/profile-form";

/**
 * Autosave state machine for the profile editor
 * (docs/architecture/08-dashboard-ux.md — debounced Server Action autosave
 * with a visible Saved / Saving… / Offline indicator). The draft is
 * validated with the domain schema before every save; an invalid in-progress
 * state parks the indicator rather than sending garbage. Optimistic
 * concurrency (doc 01) is carried by `baseRev`: on a conflict the machine
 * stops and asks the user to reload rather than clobbering another writer.
 */
export type SaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "invalid"
  | "offline"
  | "conflict";

const DEBOUNCE_MS = 800;

export function useProfileAutosave(
  form: UseFormReturn<ProfileFormValues>,
  initialRev: number,
  initialHasUnpublishedChanges: boolean,
) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  // Tracks whether the draft has content not yet snapshotted by Publish. Seeded
  // from the server (draft-vs-published diff), flipped true on any edit, and
  // reset by `markPublished` after a successful publish. Publish is disabled
  // while this is false so an unchanged draft can't be re-published (doc 01).
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(
    initialHasUnpublishedChanges,
  );
  const baseRev = useRef(initialRev);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against overlapping saves and out-of-order responses.
  const inFlight = useRef(false);
  const pending = useRef(false);

  const runSave = useCallback(async () => {
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    const parsed = profileSchema.safeParse(form.getValues());
    if (!parsed.success) {
      setStatus("invalid");
      return;
    }

    inFlight.current = true;
    setStatus("saving");
    try {
      const result = await saveProfileDraftAction({
        profile: parsed.data as Profile,
        baseRev: baseRev.current,
      });
      if (!result.ok) {
        setStatus("offline");
        return;
      }
      if (result.data.status === "conflict") {
        setStatus("conflict");
        return;
      }
      baseRev.current = result.data.draftRev;
      setStatus("saved");
    } catch {
      // Network/transport failure before a result — treat as offline.
      setStatus("offline");
    } finally {
      inFlight.current = false;
      if (pending.current) {
        pending.current = false;
        void runSave();
      }
    }
  }, [form]);

  const scheduleSave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setStatus("dirty");
    timer.current = setTimeout(() => void runSave(), DEBOUNCE_MS);
  }, [runSave]);

  const saveNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    void runSave();
  }, [runSave]);

  const markPublished = useCallback(() => setHasUnpublishedChanges(false), []);

  // Subscribe to form edits; a conflict halts autosave until reload.
  useEffect(() => {
    const subscription = form.watch(() => {
      if (status === "conflict") return;
      setHasUnpublishedChanges(true);
      scheduleSave();
    });
    return () => subscription.unsubscribe();
  }, [form, scheduleSave, status]);

  // mod+s forces an immediate save (doc 08 keyboard-first standard).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "s" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        saveNow();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [saveNow]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { status, saveNow, hasUnpublishedChanges, markPublished };
}
