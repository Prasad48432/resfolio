import { requireSession } from "@resfolio/auth";
import { getChatSession, listChatSessions } from "@resfolio/ai/server";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { Button } from "@resfolio/ui";
import { Sparkles, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";

import { AiWorkspace } from "@/components/ai/ai-workspace";
import { EmptyState } from "@/components/layout/empty-state";
import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";
import { buildProfileContext } from "@/lib/ai/profile-context";
import { isAiAvailable } from "@/lib/ai/provider";
import type { AiUIMessage } from "@/lib/ai/tools";
import { TEST_IDS } from "@/lib/testids";

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
 * `/ai?c=<id>` rather than `/ai/[id]`, because `/ai/job` already occupies that
 * position: a dynamic segment beside it makes "job" an id nobody may ever be
 * assigned, and makes the route table depend on a static/dynamic precedence rule
 * to stay correct. A parameter has neither problem and reads the same in a
 * bookmark. The transcript is loaded **here**, server-side and user-scoped, so a
 * stranger's id resolves to nothing rather than to a permission check the client
 * could skip.
 */
export const metadata: Metadata = { title: "Resfolio AI" };

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
  // about whether this profile has anything in it. Only the one boolean crosses
  // to the client — the serialized profile is the *model's* context and has no
  // business in a browser bundle.
  const profileIsEmpty = buildProfileContext(
    (await getOrCreateProfile(session.user.id)).data,
  ).isStarter;

  const [sessions, saved] = await Promise.all([
    listChatSessions(session.user.id),
    requestedSessionId
      ? getChatSession(session.user.id, requestedSessionId)
      : null,
  ]);

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
      className="mx-auto min-h-0 w-full max-w-[calc(var(--spacing-page)+15.5rem)] flex-1 gap-4"
    >
      <PageHeader
        title="Resfolio AI"
        description="Works from your profile — it can rewrite what's there, and never invents what isn't."
        // Job match is a different shape of task — one input, one result, no
        // conversation — so it is its own route rather than a mode of this one
        // (doc 13). It has no sidebar row, which makes this link, and the
        // command palette, the two ways anyone finds it.
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/ai/job" data-testid={TEST_IDS.aiJobLink}>
              <Target aria-hidden />
              Job match
            </Link>
          </Button>
        }
      />
      <AiWorkspace
        // Remounts the whole workspace when the conversation changes, which is
        // what resets the composer and the scroll position along with it. The
        // id is stable for a given URL, so this is not a remount per render.
        key={activeSessionId}
        profileIsEmpty={profileIsEmpty}
        sessionId={activeSessionId}
        // The domain stores the SDK's own message shape; it is validated on the
        // way out of the database and typed back to the app's here.
        initialMessages={(saved?.messages ?? []) as AiUIMessage[]}
        initialSessions={sessions}
      />
    </Page>
  );
}
