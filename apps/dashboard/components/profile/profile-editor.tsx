"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { profileSchema, type Profile } from "@resfolio/profile";
import { FormProvider, useForm, type Resolver } from "react-hook-form";

import { SECTION_CONFIGS, type ProfileFormValues } from "@/lib/profile-form";
import { TEST_IDS } from "@/lib/testids";

import { BasicsEditor } from "./basics-editor";
import { CustomSectionsEditor } from "./custom-sections-editor";
import { PublishButton } from "./publish-button";
import { SaveIndicator } from "./save-indicator";
import { SectionEditor } from "./section-editor";
import { useProfileAutosave } from "./use-profile-autosave";

/**
 * The profile editor (docs/architecture/08-dashboard-ux.md) — Phase 3 is
 * **form-only**; the live resume/portfolio preview pane arrives in Phase 4
 * with the Template SDK. A single React Hook Form holds the whole draft
 * (validated by the domain schema); autosave and publish operate on it. The
 * server component seeds `initialDraft` and `initialRev`.
 */
export function ProfileEditor({
  initialDraft,
  initialRev,
  publishedVersion,
  initialHasUnpublishedChanges,
}: {
  initialDraft: Profile;
  initialRev: number;
  publishedVersion: number | null;
  initialHasUnpublishedChanges: boolean;
}) {
  const form = useForm<ProfileFormValues>({
    defaultValues: initialDraft,
    // profileSchema's input type (optional fields with defaults) differs
    // from its output (ProfileFormValues); the resolver only drives inline
    // field-error UX here — authoritative validation is the domain schema
    // re-parse in useProfileAutosave. Cast reconciles the input/output skew.
    resolver: zodResolver(profileSchema) as Resolver<ProfileFormValues>,
    mode: "onChange",
  });

  const { status, saveNow, hasUnpublishedChanges, markPublished } =
    useProfileAutosave(form, initialRev, initialHasUnpublishedChanges);

  return (
    <FormProvider {...form}>
      <div
        className="mx-auto flex max-w-3xl flex-col gap-8 pb-16"
        data-testid={TEST_IDS.profileEditor}
      >
        <header className="flex flex-col gap-4 border-b border-border pb-5">
          <div className="flex flex-col gap-1">
            <p className="label-eyebrow">Your profile</p>
            <h2 className="font-display text-3xl text-foreground">
              Profile editor
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              One profile powers every resume, portfolio, and site you make.
              Edits save automatically; Publish snapshots a version.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SaveIndicator status={status} />
            <PublishButton
              status={status}
              saveNow={saveNow}
              initialPublishedVersion={publishedVersion}
              hasUnpublishedChanges={hasUnpublishedChanges}
              onPublished={markPublished}
            />
          </div>
        </header>

        {/* The form has no submit — autosave + explicit Publish own writes. */}
        <form
          onSubmit={(event) => event.preventDefault()}
          className="flex flex-col gap-10"
        >
          <BasicsEditor />
          {SECTION_CONFIGS.map((config) => (
            <SectionEditor key={config.key} config={config} />
          ))}
          <CustomSectionsEditor />
        </form>
      </div>
    </FormProvider>
  );
}
