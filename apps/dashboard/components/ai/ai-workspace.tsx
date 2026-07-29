"use client";

import type { ChatSessionSummary } from "@resfolio/ai";
import type { JobMatchSummary } from "@resfolio/job";
import type { ProfileItemRef } from "@resfolio/profile";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@resfolio/ui";
import { Briefcase, History } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  deleteChatSessionAction,
  clearChatSessionsAction,
  saveChatSessionAction,
} from "@/app/(dashboard)/ai/actions";
import { resolveChatIdentity } from "@/lib/ai/chat-identity";
import { buildJobFacts } from "@/lib/ai/job-facts";
import type { AiUIMessage } from "@/lib/ai/tools";
import { TEST_IDS } from "@/lib/testids";

import { AiChat } from "./ai-chat";
import { ChatHistory } from "./chat-history";
import { JobPanel } from "./job-panel";
import type { TailorTarget } from "./resume-tailor";

/**
 * The chat page's client half: history beside a conversation
 * (docs/architecture/13-ai-layer.md, Phase 7).
 *
 * **The rail's list lives here, in client state, seeded from the server.** The
 * alternative — `router.refresh()` after every save — would re-render the route
 * mid-conversation to add a row the user is already looking at the contents of,
 * and would remount the transcript to do it. So a save returns its summary and
 * this prepends or updates it. The server's list is still the source of truth on
 * every load and every navigation; this is only what happens between them.
 *
 * **`AiChat` is keyed on the session id.** Switching conversations is a
 * navigation, so the page hands down a different transcript; `useChat` reads its
 * initial messages once, on mount, so without the key the second conversation
 * would render the first one's. A remount here is correct rather than a cost —
 * two conversations are two components.
 *
 * **This component owns which conversation is on screen; the page reports only
 * what the URL says** (fixed 2026-07-29). It used to be the other way round: the
 * page minted an id for an unsaved chat and keyed this whole component on it, so
 * *any* re-render of the route produced a new id, a new key, and a remount —
 * `useChat`'s state gone, the user dropped into a blank new chat, mid-answer.
 * Route re-renders are ordinary: `router.refresh()` after applying tailoring,
 * every Server Action that calls `revalidatePath` (Next re-renders the current
 * tree in the action's response, whatever path was revalidated — so
 * `revalidatePath("/profile")` from the chat's own Apply button did it), and
 * Fast Refresh in development.
 *
 * A key could not have been made to work, either, because the URL is claimed
 * *during* a conversation: the first save writes `?c=<id>` with
 * `history.replaceState`, so the server's answer for this chat changes from
 * "nothing" to an id without anything having been navigated to. Keying on that
 * remounts at the transition. So identity lives here, and the prop is adopted
 * only when the **URL itself changes** — which is what a navigation is:
 *
 * - `null → null` — a re-render of a chat that has not saved yet. **Ignored.**
 *   This is the bug above.
 * - `null → <our own id>` — our `replaceState` catching up. Recorded, nothing
 *   else changes.
 * - `A → B` — the rail. Adopt B and the transcript the page loaded with it.
 * - `A → null` — "New chat". Mint an id and clear the workspace.
 *
 * **Three columns at the widest, and neither side column ever squeezes the
 * conversation.** History on the left from `lg`, the job artefact panel on the
 * right from `xl`; below each breakpoint the column becomes a sheet rather than
 * getting narrow, because 14rem of rail plus 18rem of panel beside a transcript
 * is most of a laptop and all of a phone. Both sheet triggers sit in this
 * component rather than the page header, because the header is a Server Component
 * and an open state is not serialisable.
 *
 * **`jobRefresh` is a counter, not a callback into the panel.** A job saves
 * itself from inside a message deep in the transcript, and the panel needs to
 * re-read the database when it does — but handing the panel a ref or re-creating
 * it would remount the letter someone may be mid-way through generating. A number
 * that goes up is the smallest thing that crosses that gap.
 *
 * **The job list flows back out of the panel, and that is a fix rather than a
 * flourish.** The panel re-reads jobs on every refresh and used to keep the
 * result to itself, while the match cards in the transcript read a set derived
 * once from the server props — which are constant for this component's lifetime.
 * So "this posting has already been enhanced" was true on a page load and stale
 * forever after, and the cards fell back to their own in-session flags. The panel
 * now hands its list up through `onJobs`; no extra read, since it was fetching
 * this already.
 *
 * **The active conversation id is state here, seeded from the prop.** Everything
 * about a chat's identity used to come from the URL, which is still right for
 * navigation — but "start a new chat carrying what I just pasted" cannot go
 * through the URL, because the thing being carried is a job posting and a
 * twelve-thousand-character query string is not a link. Minting the id here and
 * keying `AiChat` on it gives the same remount a navigation would, without
 * putting a posting in the address bar or in a request log.
 */
export function AiWorkspace({
  profileIsEmpty,
  sessionId,
  initialMessages,
  initialSessions,
  initialJobs,
  items,
  haystack,
  signature,
  resumes,
}: {
  profileIsEmpty: boolean;
  /** **The conversation the URL names, or `null` for a chat that has not saved
   * itself yet.** Never an id the page invented — see the header. */
  sessionId: string | null;
  initialMessages: AiUIMessage[];
  initialSessions: ChatSessionSummary[];
  /** The jobs this conversation has already produced, server-rendered so a
   * reopened chat shows its artefacts in the first paint. */
  initialJobs: JobMatchSummary[];
  items: ProfileItemRef[];
  haystack: string;
  signature: string;
  resumes: TailorTarget[];
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [jobSheetOpen, setJobSheetOpen] = useState(false);
  const [jobRefresh, setJobRefresh] = useState(0);

  /**
   * The conversation being written to.
   *
   * The URL's id when there is one, otherwise minted here. **Minting moved from
   * the server to this initialiser** and that is the fix: a `useState`
   * initialiser runs once per mount, where the page ran once per *render*.
   * Nothing renders this value into the DOM — it reaches `useChat`'s id, two
   * `key`s and a fetch argument — so the server's copy differing from the
   * client's across hydration changes no markup.
   */
  const [chatId, setChatId] = useState(() => sessionId ?? crypto.randomUUID());
  /** Text handed to a freshly minted chat — the posting the user pasted into the
   * wrong conversation. Null in every other case. */
  const [seedInput, setSeedInput] = useState<string | null>(null);

  /**
   * The jobs this conversation has produced, kept current.
   *
   * Seeded from the server so a reopened chat renders its artefacts in the first
   * paint, then replaced by whatever the panel last read. Both the panel and
   * every match card in the transcript answer questions from this one list, so
   * the two cannot disagree about whether a posting has been enhanced for.
   */
  const [jobs, setJobs] = useState(initialJobs);

  /**
   * The URL as this component last saw it.
   *
   * Adoption compares against **this**, not against `chatId`, because the
   * question being asked is "did the user navigate?" — and the answer is a
   * property of the URL changing, not of the two ids differing. They differ for
   * a perfectly ordinary reason: a chat that has not saved yet has an id here
   * and nothing in the URL.
   */
  const [urlSessionId, setUrlSessionId] = useState(sessionId);

  // **Adjusted during render, not in an effect.** React re-runs this component
  // immediately with the new state and paints once; an effect would paint the
  // conversation the user just left for a frame first, then swap it. The four
  // cases are `lib/ai/chat-identity.ts`, pure and tested — this bug cost a
  // conversation, and a rule that expensive should not live inside a JSX file.
  const change = resolveChatIdentity({
    url: sessionId,
    lastUrl: urlSessionId,
    current: chatId,
  });

  if (change.kind !== "none") {
    setUrlSessionId(sessionId);

    if (change.kind === "new") {
      setChatId(crypto.randomUUID());
      setSeedInput(null);
      setJobs([]);
      setJobRefresh(0);
    } else if (change.kind === "open") {
      // Its transcript and its jobs arrived with this same render.
      setChatId(change.sessionId);
      setSeedInput(null);
      setJobs(initialJobs);
      setJobRefresh(0);
    }
    // `adopted` records the URL and nothing else: the conversation on screen is
    // already the one the URL now names.
  }

  const onJobSaved = useCallback(() => {
    setJobRefresh((current) => current + 1);
  }, []);

  const jobFacts = useMemo(() => buildJobFacts(jobs), [jobs]);

  const startNewChat = useCallback((seed: string) => {
    // A real new conversation: new id, empty transcript, no jobs. `AiChat` is
    // keyed on the id, so it remounts with a clean `useChat` — the same thing a
    // navigation would do, minus the round trip and minus the posting in the URL.
    setChatId(crypto.randomUUID());
    setSeedInput(seed);
    setJobs([]);
    setJobRefresh(0);
    // The old conversation's `?c=` no longer describes what is on screen. The
    // new id claims its own URL on the first save, exactly as a fresh chat does.
    window.history.replaceState(null, "", "/ai");
    // And this is what stops the next route re-render reading that as a
    // navigation to "New chat" and minting a *second* id over the one just
    // handed the pasted posting. Whoever changes the URL owns telling the
    // adoption block about it.
    setUrlSessionId(null);
  }, []);

  /**
   * Saves are serialised through this.
   *
   * Two turns can settle close together — a fast answer following an
   * interrupted one — and two `saveChatSessionAction` calls racing on the same
   * row means the later transcript can be overwritten by the earlier one. A
   * promise chain costs nothing here (one write per turn) and removes the whole
   * class of problem without a revision column.
   */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const persist = useCallback(
    (messages: AiUIMessage[]) => {
      queueRef.current = queueRef.current
        .then(async () => {
          // The SDK's message shape is structurally what the domain stores; the
          // action re-validates and strips reasoning, so nothing here is trusted.
          const result = await saveChatSessionAction({
            id: chatId,
            messages,
          });

          if (!result.ok) {
            // Deliberately quiet. The conversation is on screen and working, and a
            // toast on every turn of a chat whose history happens to be failing
            // would be worse than the failure. It is logged server-side.
            return;
          }

          const saved = result.data.session;
          if (!saved) {
            return;
          }

          setSessions((current) => {
            const rest = current.filter((entry) => entry.id !== saved.id);
            // Newest activity first, matching the repository's ordering — a row
            // that stayed put after being written to would disagree with what a
            // reload shows.
            return [saved, ...rest];
          });

          // Give the conversation its URL, now that it has one.
          //
          // **`history.replaceState`, not `router.replace`.** The router would
          // re-render the route on the server, which regenerates the new-chat id,
          // which changes this component's `key` — remounting the transcript the
          // user is reading, mid-conversation, to change an address bar. This
          // updates the URL and nothing else, so a refresh or a shared link lands
          // back in the same chat and everything on screen stays where it is.
          if (window.location.search !== `?c=${chatId}`) {
            window.history.replaceState(null, "", `/ai?c=${chatId}`);
          }
        })
        .catch(() => {
          // Swallowed for the same reason: a failed history write must not be able
          // to break the chat it is a record of.
        });
    },
    [chatId],
  );

  const remove = useCallback(
    async (id: string) => {
      const result = await deleteChatSessionAction({ id });

      if (!result.ok) {
        toast.error("Couldn't delete that chat", { description: result.error });
        return;
      }

      setSessions((current) => current.filter((entry) => entry.id !== id));

      if (id === chatId) {
        // The conversation on screen no longer exists, so there is nothing to
        // keep: a full load of `/ai` is the cheapest way to be certain every
        // piece of client state that described it is gone. (It is not the `key`
        // any more — there isn't one; see the header.)
        window.location.assign("/ai");
        return;
      }

      toast.success("Chat deleted");
    },
    [chatId],
  );

  const clear = useCallback(async () => {
    const result = await clearChatSessionsAction({});

    if (!result.ok) {
      toast.error("Couldn't clear your history", { description: result.error });
      return;
    }

    setSessions([]);
    window.location.assign("/ai");
  }, []);

  const history = (
    <ChatHistory
      sessions={sessions}
      activeId={sessions.some((entry) => entry.id === chatId) ? chatId : null}
      onDelete={remove}
      onClear={clear}
      onNew={() => startNewChat("")}
      onNavigate={() => setSheetOpen(false)}
    />
  );

  const jobPanel = (
    <JobPanel
      key={chatId}
      chatSessionId={chatId}
      initialJobs={jobs}
      onJobs={setJobs}
      items={items}
      haystack={haystack}
      signature={signature}
      resumes={resumes}
      refreshToken={jobRefresh}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 gap-6">
      <aside className="hidden w-56 shrink-0 lg:block">{history}</aside>

      <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-2">
        {/* The two triggers that stand in for the columns this viewport is too
            narrow to carry. One row, so a phone spends one line of vertical
            space on navigation rather than two. */}
        <div className="flex items-center gap-1 xl:hidden">
          <div className="lg:hidden">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted"
                  data-testid={TEST_IDS.chatHistoryToggle}
                >
                  <History className="size-4" aria-hidden />
                  {sessions.length > 0 ? `Chats (${sessions.length})` : "Chats"}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-72 flex-col gap-3 p-4"
              >
                <SheetTitle>Your chats</SheetTitle>
                <SheetDescription className="sr-only">
                  Open a saved conversation, start a new one, or delete one.
                </SheetDescription>
                {history}
              </SheetContent>
            </Sheet>
          </div>

          <Sheet open={jobSheetOpen} onOpenChange={setJobSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted"
                data-testid={TEST_IDS.jobPanelToggle}
              >
                <Briefcase className="size-4" aria-hidden />
                {jobs.length > 0 ? "This job" : "Job"}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-80 max-w-[90vw] flex-col gap-3 overflow-y-auto p-4"
            >
              <SheetTitle>This job</SheetTitle>
              <SheetDescription className="sr-only">
                The posting, the resume you&apos;ll send, and the cover letter.
              </SheetDescription>
              {jobPanel}
            </SheetContent>
          </Sheet>
        </div>

        <AiChat
          key={chatId}
          profileIsEmpty={profileIsEmpty}
          sessionId={chatId}
          // A chat started from here is genuinely new, so it starts empty — the
          // server's transcript belongs to the conversation the user left.
          initialMessages={chatId === sessionId ? initialMessages : []}
          // Only ever set by `startNewChat`, which is the one path that has
          // something to carry. Written as a comparison against `sessionId`
          // before, which quietly meant "" for every fresh chat.
          initialInput={seedInput ?? undefined}
          resumes={resumes}
          jobFacts={jobFacts}
          onTurnComplete={persist}
          onJobSaved={onJobSaved}
          onStartNewChat={startNewChat}
        />
      </div>

      {/* `overflow-y-auto` on the column, not the page: the panel is a sibling
          of the chat's own bounded scroller, and a tall letter here must scroll
          inside its column rather than growing the shell's content region. */}
      <aside className="hidden w-72 shrink-0 overflow-y-auto xl:block">
        {jobPanel}
      </aside>
    </div>
  );
}
