"use client";

import type { ChatSessionSummary } from "@resfolio/ai";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@resfolio/ui";
import { History } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import {
  deleteChatSessionAction,
  clearChatSessionsAction,
  saveChatSessionAction,
} from "@/app/(dashboard)/ai/actions";
import type { AiUIMessage } from "@/lib/ai/tools";
import { TEST_IDS } from "@/lib/testids";

import { AiChat } from "./ai-chat";
import { ChatHistory } from "./chat-history";

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
 * The rail is a **column on `lg` and a sheet below it**, not a column that gets
 * narrow: 16rem of history beside a 40rem transcript is most of a phone. The
 * sheet trigger sits in this component rather than the page header because the
 * header is a Server Component and the sheet's open state is not serialisable.
 */
export function AiWorkspace({
  profileIsEmpty,
  sessionId,
  initialMessages,
  initialSessions,
}: {
  profileIsEmpty: boolean;
  /** Stable for the life of a conversation: either the id in the URL, or one
   * minted by the page for a chat that has not saved itself yet. */
  sessionId: string;
  initialMessages: AiUIMessage[];
  initialSessions: ChatSessionSummary[];
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [sheetOpen, setSheetOpen] = useState(false);

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
            id: sessionId,
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
          if (window.location.search !== `?c=${sessionId}`) {
            window.history.replaceState(null, "", `/ai?c=${sessionId}`);
          }
        })
        .catch(() => {
          // Swallowed for the same reason: a failed history write must not be able
          // to break the chat it is a record of.
        });
    },
    [sessionId],
  );

  const remove = useCallback(
    async (id: string) => {
      const result = await deleteChatSessionAction({ id });

      if (!result.ok) {
        toast.error("Couldn't delete that chat", { description: result.error });
        return;
      }

      setSessions((current) => current.filter((entry) => entry.id !== id));

      if (id === sessionId) {
        // The conversation on screen no longer exists. A hard navigation rather
        // than a router push: this must land on a genuinely new chat with a new
        // id, and the page's own `key` is what guarantees that.
        window.location.assign("/ai");
        return;
      }

      toast.success("Chat deleted");
    },
    [sessionId],
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
      activeId={
        sessions.some((entry) => entry.id === sessionId) ? sessionId : null
      }
      onDelete={remove}
      onClear={clear}
      onNavigate={() => setSheetOpen(false)}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 gap-6">
      <aside className="hidden w-56 shrink-0 lg:block">{history}</aside>

      <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-2">
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
            <SheetContent side="left" className="flex w-72 flex-col gap-3 p-4">
              <SheetTitle>Your chats</SheetTitle>
              <SheetDescription className="sr-only">
                Open a saved conversation, start a new one, or delete one.
              </SheetDescription>
              {history}
            </SheetContent>
          </Sheet>
        </div>

        <AiChat
          key={sessionId}
          profileIsEmpty={profileIsEmpty}
          sessionId={sessionId}
          initialMessages={initialMessages}
          onTurnComplete={persist}
        />
      </div>
    </div>
  );
}
