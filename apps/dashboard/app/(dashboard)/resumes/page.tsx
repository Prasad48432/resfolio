import { requireSession } from "@resfolio/auth";
import { listDocuments } from "@resfolio/document/server";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { Card } from "@resfolio/ui";
import { FileText } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";
import { Stagger, StaggerItem } from "@/components/motion/motion";
import { CreateResumeButton } from "@/components/resume/create-resume-button";
import { PublicResumeCard } from "@/components/resume/public-resume-card";
import { ResumeThumbnail } from "@/components/resume/resume-thumbnail";
import { env } from "@/lib/env";
import { RESUME_TEMPLATES } from "@/lib/resume-templates";
import { TEST_IDS, resumeItemTestId } from "@/lib/testids";

/** The public origin for the `/r/<handle>` link on the Public resume card. */
function publicBaseUrl(): string {
  return (env.SITES_URL ?? "https://resfolio.me").replace(/\/$/, "");
}

/**
 * The resumes list (docs/architecture/08-dashboard-ux.md IA:
 * `resumes → /resumes/[id]`). A resume is a document — a `Profile × config`
 * rendering — so this screen creates/opens them; the profile content itself
 * lives at `/profile`. Reads server-side via the document domain.
 */
export default async function ResumesPage() {
  const { user } = await requireSession();
  // A document attaches to the user's profile; make sure it exists first. The
  // draft carries the shared handle + which resume is pinned to `/r/<handle>`.
  const draft = await getOrCreateProfile(user.id, {
    name: user.name,
    email: user.email,
  });
  const documents = await listDocuments(user.id);

  // One resume per template (enforced in the document domain); the create menu
  // reflects which templates are already in use.
  const usedTemplateIds = documents.map((doc) => doc.templateId);

  return (
    <Page>
      <PageHeader
        title="Resumes"
        description="Each resume renders from your profile — what you preview is pixel-for-pixel what the PDF exports."
        actions={
          <CreateResumeButton
            templates={RESUME_TEMPLATES}
            usedTemplateIds={usedTemplateIds}
          />
        }
      />

      <PublicResumeCard
        handle={draft.handle}
        publicBaseUrl={publicBaseUrl()}
        publicResumeId={draft.publicResumeId}
        resumes={documents.map((doc) => ({ id: doc.id, name: doc.name }))}
      />

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No resumes yet"
          description="Create one to pick a template, set the page size, and see it render live from your profile."
          data-testid={TEST_IDS.resumesEmpty}
        />
      ) : (
        // `Stagger` is a client island; the cards themselves stay server-
        // rendered and are passed through as children, so this grid costs no
        // extra client JS beyond the wrapper. A resume is a visual artefact, so
        // it earns an A4 preview rather than a text row (placeholder for now —
        // the live render is one click away in the editor).
        <Stagger
          className="grid grid-cols-2 gap-4 sm:grid-cols-3"
          data-testid={TEST_IDS.resumesList}
        >
          {documents.map((doc) => {
            const pageSize =
              typeof doc.config.pageSize === "string"
                ? doc.config.pageSize
                : "A4";
            const templateName =
              RESUME_TEMPLATES.find((t) => t.id === doc.templateId)?.name ??
              "Resume";
            const variant =
              doc.templateId === "resume-editorial" ? "editorial" : "classic";
            return (
              <StaggerItem key={doc.id}>
                <Card interactive asChild>
                  <Link
                    href={`/resumes/${doc.id}`}
                    className="flex flex-col gap-0 overflow-hidden p-0"
                    data-testid={resumeItemTestId(doc.id)}
                  >
                    <ResumeThumbnail
                      variant={variant}
                      className="border-b border-border"
                    />
                    <span className="flex min-w-0 flex-col gap-0.5 p-3.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {doc.name}
                      </span>
                      <span className="truncate text-xs text-muted">
                        {templateName} · {pageSize}
                      </span>
                    </span>
                  </Link>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </Page>
  );
}
