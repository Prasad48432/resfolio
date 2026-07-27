import { requireSession } from "@resfolio/auth";
import { listDocuments } from "@resfolio/document/server";
import { countTailoredFields, describeProfileItems } from "@resfolio/profile";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { Button } from "@resfolio/ui";
import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { JobAnalyzer } from "@/components/ai/job-analyzer";
import { EmptyState } from "@/components/layout/empty-state";
import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";
import { buildProfileContext } from "@/lib/ai/profile-context";
import { isAiAvailable } from "@/lib/ai/provider";

/**
 * Job match (docs/architecture/13-ai-layer.md, Phase 4).
 *
 * **A dedicated route rather than a chat mode**, which was doc 13's open
 * question and is settled here. This workflow has one input and a fixed
 * pipeline: paste a posting, read the analysis. A conversation metaphor would
 * add turn-taking to something that has exactly one turn, and would put a
 * structured result — a score, a requirement table — inside a transcript that
 * scrolls it away. `/ai` stays the conversation; this is a tool.
 *
 * Two things cross to the client, and neither is the profile:
 *
 * - **The item index** (`{ id, section, label }` per item), because a match
 *   cites profile item ids and the analysis has to resolve them to names the
 *   user recognises — and because an id that resolves to nothing is how an
 *   unsupported match is caught (`job-analysis.ts`).
 * - **The context JSON as a keyword haystack**, so "your profile never mentions
 *   Kubernetes" is checked against *exactly* what the model was shown. Using
 *   the raw draft instead would let a keyword match a starter placeholder that
 *   was stripped before the model saw it, and report coverage the model was
 *   never told about.
 *
 * Phase 5 adds a third: **the user's resumes, as three fields each** (id, name,
 * whether it is public, and how many fields it already overrides). Not the
 * documents — a resume's config, template and view are none of the tailoring
 * panel's business, and shipping them would put a `ViewDefinition` in a browser
 * bundle to answer a question about a name.
 */
export const metadata: Metadata = { title: "Job match" };

/**
 * **The tailoring action's ceiling, and it has to live here.** `maxDuration` is
 * route-segment configuration, so a Server Action inherits it from the page it is
 * invoked from — there is no way to set it on the action itself. Without this the
 * platform default (ten seconds on Vercel's smaller plans) kills a tailoring pass
 * mid-call, which surfaces as the generic "didn't go through" and is indistinguish-
 * able from a model failure. `/api/ai/job` sets the same number on itself.
 */
export const maxDuration = 60;

export default async function JobMatchPage() {
  const session = await requireSession();

  const available = isAiAvailable();
  if (!available) {
    return (
      <Page>
        <PageHeader title="Job match" />
        <EmptyState
          icon={Sparkles}
          title="Resfolio AI isn't available"
          description="This environment has no AI provider configured, or the feature has been switched off."
        />
      </Page>
    );
  }

  const [draft, documents] = await Promise.all([
    getOrCreateProfile(session.user.id),
    listDocuments(session.user.id),
  ]);
  const context = buildProfileContext(draft.data);

  const resumes = documents
    .filter((document) => document.kind === "resume")
    .map((document) => ({
      id: document.id,
      name: document.name,
      isPublic: document.visibility === "public",
      tailoredFields: countTailoredFields(document.view),
    }));

  return (
    <Page>
      <PageHeader
        title="Job match"
        description="Paste a job description. Resfolio reads it against your profile, requirement by requirement — and every match has to point at something you actually wrote. Then it can tailor a resume for it and draft a cover letter, without touching your profile."
      />
      {context.isStarter ? (
        // Answered here rather than by spending an analysis to discover it. A
        // match against an empty profile is a page of gaps, which reads as the
        // tool being broken rather than as the profile being empty.
        <EmptyState
          icon={Sparkles}
          title="Your profile is still the starter template"
          description="There's nothing yet to match a job against. Replace the example entries and come back."
          action={
            <Button asChild size="sm">
              <Link href="/profile">Edit your profile</Link>
            </Button>
          }
        />
      ) : (
        <JobAnalyzer
          items={describeProfileItems(draft.data)}
          haystack={context.json}
          resumes={resumes}
          // The letter is signed by the platform, not written by the model — so
          // the name comes from the profile rather than from generated text.
          signature={draft.data.basics.name}
        />
      )}
    </Page>
  );
}
