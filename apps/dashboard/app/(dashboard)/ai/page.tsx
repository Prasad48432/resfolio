import { requireSession } from "@resfolio/auth";
import { getChatSession, listChatSessions } from "@resfolio/ai/server";
import { listDocuments } from "@resfolio/document/server";
import { listJobMatchesForChat } from "@resfolio/job/server";
import { countTailoredFields, describeProfileItems } from "@resfolio/profile";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";

import { AiWorkspace } from "@/components/ai/ai-workspace";
import { EmptyState } from "@/components/layout/empty-state";
import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";
import { buildProfileContext } from "@/lib/ai/profile-context";
import { isAiAvailable } from "@/lib/ai/provider";
import type { AiUIMessage } from "@/lib/ai/tools";
import { reconcileTranscript } from "@/lib/ai/transcript";

/**
 * Resfolio AI (docs/architecture/13-ai-layer.md).
 *
 * A Server Component that resolves the session and decides whether the feature
 * exists at all, then hands off to one client island. The session check is not
 * inherited from the `(dashboard)` layout — every entry point verifies for
 * itself (doc 10, defense in depth) — and it is what guarantees the island
 * below is only ever mounted for a real user.
 *
 * The availability gate is a *hide*, never a guard: `/api/ai/chat` refuses
 * independently. If this page were the only check, the endpoint would still be
 * reachable with a curl, which is the same reasoning behind the PDF export
 * route's kill switch.
 *
 * **A saved conversation is a search parameter, not a route segment** (Phase 7).
 * `/ai?c=<id>` rather than `/ai/[id]`. `/ai/job` occupied that position when the
 * decision was made and the reasoning outlived it: a dynamic segment here makes
 * every future static child — `/ai/settings`, `/ai/jobs` — an id nobody may be
 * assigned, and makes the route table depend on a precedence rule to stay
 * correct. A parameter has neither problem and reads the same in a bookmark. The
 * transcript is loaded **here**, server-side and user-scoped, so a stranger's id
 * resolves to nothing rather than to a permission check the client could skip.
 *
 * **This page is now the whole job workflow too** (Phase 7). `/ai/job` is gone:
 * paste a posting into the conversation, the model calls `analyzeJobMatch`, and
 * the artefact panel beside the chat carries the posting, the resume and the
 * letter. What that route did with three stacked panels and its own textarea, the
 * conversation does with a tool result — and the posting no longer has to be
 * pasted into a second box on a second screen to get from "how do I look for this
 * job" to "here is the letter".
 *
 * Four things cross to the client, and none of them is the raw profile:
 *
 * - `profileIsEmpty`, so the screen and the model agree about a starter profile.
 * - **The item index** (`{ id, section, label }`), because a citation has to
 *   resolve to a name the user recognises.
 * - **The context JSON as a keyword haystack**, so the letter's vocabulary check
 *   runs against *exactly* what the model was shown.
 * - **The resumes, as two fields each** — not the documents. A `ViewDefinition`
 *   in a browser bundle to answer a question about a name is the trade this
 *   avoids.
 */
export const metadata: Metadata = { title: "Resfolio AI" };

/**
 * **The Server Actions' ceiling, and it has to live here.** `maxDuration` is
 * route-segment configuration, so an action inherits it from the page it is
 * invoked from — there is no way to set it on the action itself. Two of this
 * page's actions call a model and take twenty-odd seconds: `enhanceProfileForJob`
 * and `tailorResume`. Without this the platform default (ten seconds on Vercel's
 * smaller plans) kills them mid-call, which surfaces as the generic "didn't go
 * through" and is indistinguishable from a model failure. It moved here with the
 * job workflow when `/ai/job`, which used to carry it, was retired.
 */
export const maxDuration = 60;

export default async function AiPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const session = await requireSession();
  const { c: requestedSessionId } = await searchParams;

  const available = isAiAvailable();

  if (!available) {
    return (
      <Page className="min-h-0 flex-1 gap-4">
        <PageHeader
          title="Resfolio AI"
          description="Works from your profile — it can rewrite what's there, and never invents what isn't."
        />
        <EmptyState
          icon={Sparkles}
          title="Resfolio AI isn't available"
          description="This environment has no AI provider configured, or the feature has been switched off."
        />
      </Page>
    );
  }

  // The same builder the route runs, so the screen and the model always agree
  // about whether this profile has anything in it — and so the letter's keyword
  // check runs against exactly the text the model read.
  const draft = await getOrCreateProfile(session.user.id);
  const context = buildProfileContext(draft.data);

  const [sessions, saved, documents] = await Promise.all([
    listChatSessions(session.user.id),
    requestedSessionId
      ? getChatSession(session.user.id, requestedSessionId)
      : null,
    listDocuments(session.user.id),
  ]);

  const resumes = documents
    .filter((document) => document.kind === "resume")
    .map((document) => ({
      id: document.id,
      name: document.name,
      isPublic: document.visibility === "public",
      tailoredFields: countTailoredFields(document.view),
    }));

  /**
   * The id this page's chat writes to.
   *
   * Minted here rather than in the browser so that it is stable across the
   * client render — `crypto.randomUUID()` inside a component would produce a
   * different id on the server and on hydration, which is a saved conversation
   * split across two rows. A requested id that resolved to nothing (deleted,
   * or never the caller's) falls through to a fresh chat rather than to a 404:
   * both are reached by following a stale link, and neither is worth an error
   * page when the working thing is one line below.
   */
  const activeSessionId = saved?.id ?? randomUUID();

  // The jobs this conversation produced. Loaded here rather than fetched by the
  // panel on mount so that reopening a saved chat shows its artefacts in the
  // first paint — a panel that flashes "paste a posting" over a conversation
  // that plainly contains one reads as the feature having forgotten.
  const jobs = saved
    ? await listJobMatchesForChat(session.user.id, saved.id)
    : [];

  return (
    // `min-h-0 flex-1` is what claims the viewport height the shell now hands
    // down (`app-shell.tsx`) — the chat is the one route that fills its pane
    // instead of growing past it. `gap-4` because the header is chrome above a
    // surface here, not a sibling block in a stack of content.
    //
    // **`wide` plus exactly the rail's width**, rather than the standard measure.
    // The history rail is 14rem and the gap 1.5rem, so inside the ordinary 56rem
    // page it would have taken a quarter of the transcript — the conversation
    // would have got narrower because a sidebar was added beside it. This puts
    // the rail in the margin the page already wasn't using and leaves the chat
    // column at the measure it had. A header spanning a two-column workspace is
    // the established shape here (`/resumes/[id]` does the same).
    <Page
      wide
      // Widened again for the artefact panel on the right: rail + chat + panel.
      // Below `xl` the panel becomes a sheet rather than a third column, so this
      // maximum only ever applies where all three genuinely fit.
      className="mx-auto min-h-0 w-full max-w-[calc(var(--spacing-page)+36rem)] flex-1 gap-4"
    >
      <PageHeader
        title="Resfolio AI"
        description="Works from your profile — it can rewrite what's there, and never invents what isn't. Paste a job posting and it reads it against you, requirement by requirement."
      />
      <AiWorkspace
        // Remounts the whole workspace when the conversation changes, which is
        // what resets the composer and the scroll position along with it. The
        // id is stable for a given URL, so this is not a remount per render.
        key={activeSessionId}
        profileIsEmpty={context.isStarter}
        sessionId={activeSessionId}
        // The domain stores the SDK's own message shape; it is validated on the
        // way out of the database and typed back to the app's here.
        //
        // **Re-judged against the profile before it is rendered**
        // (`reconcileTranscript`). A saved transcript records what was
        // *suggested*, never what was done with it, so replaying it verbatim put
        // Apply buttons back on changes the user accepted weeks ago — and
        // pressing one either did nothing or overwrote wording edited by hand
        // since. The guard already had the right verdict for this (`unchanged`);
        // this is a re-run of it, not a second one.
        initialMessages={reconcileTranscript(
          (saved?.messages ?? []) as AiUIMessage[],
          draft.data,
        )}
        initialSessions={sessions}
        initialJobs={jobs}
        items={describeProfileItems(draft.data)}
        haystack={context.json}
        // The letter is signed by the platform, not written by the model — so
        // the name comes from the profile rather than from generated text.
        signature={draft.data.basics.name}
        resumes={resumes}
      />
    </Page>
  );
}
