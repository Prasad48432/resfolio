import { requireSession } from "@resfolio/auth";
import { listJobMatches } from "@resfolio/job/server";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { Button } from "@resfolio/ui";
import { Briefcase } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";
import { JobTracker } from "@/components/jobs/job-tracker";
import { toJobCardView } from "@/lib/jobs";
import { TEST_IDS } from "@/lib/testids";

/**
 * The Job Tracker (docs/architecture/13-ai-layer.md, Phase 7 → the tracker).
 *
 * **A UI over data that was already there.** `job_match_sessions.status` has been
 * written on every row since the table was created, precisely so this screen
 * would not have to arrive with a migration that guesses at rows predating the
 * concept. Every posting analysed in a conversation is already a card here, in
 * Saved.
 *
 * A Server Component around one client island, in the shape `/sources` uses:
 * read through the domain, map to plain DTOs (`lib/jobs.ts`), hand them over.
 * The board's drag state, the view toggle and the optimistic moves are all
 * client concerns and none of them belongs in this file.
 *
 * `<Page wide>`: six columns do not fit the reading measure, and the board owns
 * its own horizontal scroll — see `job-board.tsx`.
 */
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const session = await requireSession();
  // First-visit safety, as everywhere else: jobs hang off the profile, and
  // arriving here before the profile row exists is an ordinary order of events.
  await getOrCreateProfile(session.user.id, {
    name: session.user.name,
    email: session.user.email,
  });

  const jobs = await listJobMatches(session.user.id);

  return (
    <Page wide>
      <PageHeader
        title="Job Tracker"
        description="Every posting you've analysed, and where it got to. Drag a card to move it; the flow view reads the whole search at once."
      />

      {jobs.length === 0 ? (
        <EmptyState
          data-testid={TEST_IDS.jobTrackerEmpty}
          icon={Briefcase}
          title="No jobs yet"
          description="Paste a job posting into Resfolio AI. It reads the posting against your profile and the job lands here, ready to track."
          action={
            <Button asChild size="sm">
              <Link href="/ai">Analyse a posting</Link>
            </Button>
          }
        />
      ) : (
        <JobTracker initialJobs={jobs.map(toJobCardView)} />
      )}
    </Page>
  );
}
