import { requireSession } from "@resfolio/auth";
import { listDocuments } from "@resfolio/document/server";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { FileText } from "lucide-react";
import Link from "next/link";

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
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div className="flex flex-col gap-1">
          <p className="label-eyebrow">Your resumes</p>
          <h2 className="font-display text-3xl text-foreground">Resumes</h2>
          <p className="text-sm leading-relaxed text-muted">
            Each resume renders from your profile — what you preview is
            pixel-for-pixel what the PDF exports.
          </p>
        </div>
        <CreateResumeButton hasExisting={documents.length > 0} />
      </header>

      {documents.length === 0 ? (
        <div
          className="card-surface flex flex-col items-center gap-3 p-10 text-center"
          data-testid={TEST_IDS.resumesEmpty}
        >
          <FileText className="size-8 text-muted" aria-hidden />
          <p className="text-sm text-muted">
            No resumes yet. Create one to pick a template, set the page size,
            and see it render live from your profile.
          </p>
        </div>
      ) : (
        <ul
          className="flex flex-col gap-3"
          data-testid={TEST_IDS.resumesList}
        >
          {documents.map((doc) => {
            const pageSize =
              typeof doc.config.pageSize === "string"
                ? doc.config.pageSize
                : "A4";
            return (
              <li key={doc.id}>
                <Link
                  href={`/resumes/${doc.id}`}
                  className="card-surface flex items-center gap-4 p-4 transition-colors hover:border-accent/40"
                  data-testid={resumeItemTestId(doc.id)}
                >
                  <FileText className="size-5 shrink-0 text-accent" aria-hidden />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {doc.name}
                    </span>
                    <span className="text-xs text-muted">
                      Classic · {pageSize} · updated{" "}
                      {doc.updatedAt.toLocaleDateString()}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
