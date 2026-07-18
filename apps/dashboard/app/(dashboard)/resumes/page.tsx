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
import { TEST_IDS, resumeItemTestId } from "@/lib/testids";

/**
 * The resumes list (docs/architecture/08-dashboard-ux.md IA:
 * `resumes → /resumes/[id]`). A resume is a document — a `Profile × config`
 * rendering — so this screen creates/opens them; the profile content itself
 * lives at `/profile`. Reads server-side via the document domain.
 */
export default async function ResumesPage() {
  const { user } = await requireSession();
  // A document attaches to the user's profile; make sure it exists first.
  await getOrCreateProfile(user.id, { name: user.name, email: user.email });
  const documents = await listDocuments(user.id);

  return (
    <Page>
      <PageHeader
        title="Resumes"
        description="Each resume renders from your profile — what you preview is pixel-for-pixel what the PDF exports."
        actions={<CreateResumeButton hasExisting={documents.length > 0} />}
      />

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No resumes yet"
          description="Create one to pick a template, set the page size, and see it render live from your profile."
          data-testid={TEST_IDS.resumesEmpty}
        />
      ) : (
        // `Stagger` is a client island; the rows themselves stay server-
        // rendered and are passed through as children, so this list costs no
        // extra client JS beyond the wrapper.
        <Stagger
          className="flex flex-col gap-2"
          data-testid={TEST_IDS.resumesList}
        >
          {documents.map((doc) => {
            const pageSize =
              typeof doc.config.pageSize === "string"
                ? doc.config.pageSize
                : "A4";
            return (
              <StaggerItem key={doc.id}>
                <Card interactive asChild>
                  <Link
                    href={`/resumes/${doc.id}`}
                    className="flex items-center gap-3.5 p-3.5"
                    data-testid={resumeItemTestId(doc.id)}
                  >
                    <FileText
                      className="size-4 shrink-0 text-muted"
                      aria-hidden
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {doc.name}
                      </span>
                      <span className="text-xs text-muted">
                        Classic · {pageSize} · updated{" "}
                        {doc.updatedAt.toLocaleDateString()}
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
