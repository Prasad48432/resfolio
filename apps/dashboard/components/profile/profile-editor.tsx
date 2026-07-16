"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { profileSchema, type Profile } from "@resfolio/profile";
import { FormProvider, useForm, type Resolver } from "react-hook-form";

import { PageHeader } from "@/components/layout/page-header";
import { Page } from "@/components/layout/page";
import { FadeIn } from "@/components/motion/motion";
import { SaveIndicator } from "@/components/status/save-indicator";
import { SECTION_CONFIGS, type ProfileFormValues } from "@/lib/profile-form";
import { TEST_IDS } from "@/lib/testids";

import { BasicsEditor } from "./basics-editor";
import { CustomSectionsEditor } from "./custom-sections-editor";
import { PublishButton } from "./publish-button";
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
      <Page className="pb-16" data-testid={TEST_IDS.profileEditor}>
        <PageHeader
          title="Profile"
          description="One profile powers every resume, portfolio, and site you make. Edits save automatically; Publish snapshots a version."
          actions={
            <>
              <SaveIndicator
                status={status}
                testId={TEST_IDS.profileSaveIndicator}
              />
              <PublishButton
                status={status}
                saveNow={saveNow}
                initialPublishedVersion={publishedVersion}
                hasUnpublishedChanges={hasUnpublishedChanges}
                onPublished={markPublished}
              />
            </>
          }
        />

        {/* The form has no submit — autosave + explicit Publish own writes. */}
        <FadeIn>
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
        </FadeIn>
      </Page>
    </FormProvider>
  );
}
