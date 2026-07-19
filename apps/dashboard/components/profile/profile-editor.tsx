"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { profileSchema, type Profile } from "@resfolio/profile";
import { useCallback } from "react";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Page } from "@/components/layout/page";
import { FadeIn } from "@/components/motion/motion";
import { SaveIndicator } from "@/components/status/save-indicator";
import { firstErrorPath, focusField } from "@/lib/form-errors";
import { SECTION_CONFIGS, type ProfileFormValues } from "@/lib/profile-form";
import { TEST_IDS } from "@/lib/testids";

import { BasicsEditor } from "./basics-editor";
import { CustomSectionsEditor } from "./custom-sections-editor";
import { ProjectedPosts, type ProjectedPost } from "./projected-posts";
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
  nativePosts = [],
}: {
  initialDraft: Profile;
  initialRev: number;
  publishedVersion: number | null;
  initialHasUnpublishedChanges: boolean;
  /**
   * Published blog posts, shown read-only in Writing. They are not part of the
   * draft and never enter the form — the form's values are what autosave
   * writes back, so a projected row landing in it would copy a post into the
   * profile JSON and create the duplicate the projection exists to avoid.
   */
  nativePosts?: readonly ProjectedPost[];
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

  /**
   * Take the user to the first thing that's wrong.
   *
   * `trigger()` first because the resolver runs `onChange`: a field the user
   * never touched (a seeded blank, an imported item) can be invalid with no
   * error recorded yet, and jumping to "the first error" while a worse one
   * sits above it is more confusing than not jumping at all. Returns whether
   * the form is valid so callers can decide what to do next.
   */
  const reviewInvalid = useCallback(async () => {
    const valid = await form.trigger();
    if (valid) {
      return true;
    }
    const path = firstErrorPath(form.formState.errors);
    if (path && focusField(path)) {
      toast.error("Some fields need attention", {
        description: "Jumped to the first one that needs fixing.",
      });
    } else {
      toast.error("Some fields need attention", {
        description: "Check the highlighted fields before publishing.",
      });
    }
    return false;
  }, [form]);

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
                onReviewInvalid={() => void reviewInvalid()}
              />
              <PublishButton
                status={status}
                saveNow={saveNow}
                reviewInvalid={reviewInvalid}
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
              <SectionEditor
                key={config.key}
                config={config}
                // Published blog posts show in Writing as read-only rows.
                // Passed as `undefined` (not an empty component) when there
                // are none, so the section's empty state still appears.
                projected={
                  config.key === "writing" && nativePosts.length > 0 ? (
                    <ProjectedPosts posts={nativePosts} />
                  ) : undefined
                }
              />
            ))}
            <CustomSectionsEditor />
          </form>
        </FadeIn>
      </Page>
    </FormProvider>
  );
}
