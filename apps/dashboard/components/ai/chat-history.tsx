"use client";

import type { ChatSessionSummary } from "@resfolio/ai";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Spinner,
  cn,
} from "@resfolio/ui";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { groupChatSessions } from "@/lib/ai/chat-history";
import { chatSessionTestId, TEST_IDS } from "@/lib/testids";

/**
 * The saved-chat rail (docs/architecture/13-ai-layer.md, Phase 7).
 *
 * **Rows are links, not buttons.** A conversation has a URL (`/ai?c=<id>`), so
 * it can be bookmarked, opened in a second tab, and reached with the back
 * button — none of which a click handler that swaps client state gives you. The
 * page reads the transcript server-side from that parameter, which also means
 * the rail ships titles and dates and never a transcript.
 *
 * **Delete has no confirmation and Clear all does.** Deleting the row you are
 * pointing at destroys one conversation you can see; a modal in front of it is a
 * tax on tidying up. Clearing the history is unbounded and reaches things
 * scrolled out of view, which is exactly the case a confirmation is for.
 *
 * The list is owned by the parent (`AiWorkspace`) rather than by this component
 * so that a chat saving itself mid-conversation can prepend a row without a
 * server round trip and without remounting the transcript being read.
 */
export function ChatHistory({
  sessions,
  activeId,
  onDelete,
  onClear,
  onNavigate,
}: {
  sessions: ChatSessionSummary[];
  /** The session the page is showing, or null for a chat that has not saved
   * itself yet. */
  activeId: string | null;
  onDelete: (id: string) => Promise<void>;
  onClear: () => Promise<void>;
  /** Called when a row is followed, so a mobile sheet can close itself. */
  onNavigate?: () => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  // `new Date()` at render time is deliberate: the buckets are relative to now,
  // and this list is re-rendered on every navigation and every save.
  const groups = useMemo(() => groupChatSessions(sessions), [sessions]);

  async function remove(id: string) {
    setPendingId(id);
    try {
      await onDelete(id);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-3"
      data-testid={TEST_IDS.chatHistory}
    >
      {/* A link, not a button that clears state: a new chat is a different URL
          with a different id, and navigating is what guarantees the page mints
          one. Leaving mid-answer aborts the request, which is what leaving
          should do. */}
      <Button
        asChild
        variant="secondary"
        size="sm"
        className="w-full justify-start"
        data-testid={TEST_IDS.chatNew}
      >
        <Link href="/ai" onClick={onNavigate}>
          <MessageSquarePlus className="size-4" aria-hidden />
          New chat
        </Link>
      </Button>

      {/* The rail is the only thing on this page besides the transcript that
          scrolls, and it must scroll independently — a history long enough to
          push the composer off screen is the bug the shell's height chain
          exists to prevent. */}
      <div className="thin-scrollbar -mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
        {sessions.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted">
            Chats you have are saved here automatically.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <div key={group.label} className="flex flex-col gap-0.5">
                <p className="px-2 pb-1 text-[11px] font-medium text-muted">
                  {group.label}
                </p>
                {group.sessions.map((entry) => (
                  <ChatRow
                    key={entry.id}
                    session={entry}
                    active={entry.id === activeId}
                    deleting={pendingId === entry.id}
                    onDelete={() => void remove(entry.id)}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {sessions.length > 0 ? (
        <Dialog open={clearOpen} onOpenChange={setClearOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted"
              data-testid={TEST_IDS.chatClearAll}
            >
              <Trash2 className="size-3.5" aria-hidden />
              Clear history
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogTitle>Clear chat history?</DialogTitle>
            <DialogDescription>
              This deletes all {sessions.length}{" "}
              {sessions.length === 1 ? "conversation" : "conversations"} and
              can&apos;t be undone. Your profile and everything you applied from
              a chat stay exactly as they are.
            </DialogDescription>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setClearOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={clearing}
                onClick={async () => {
                  setClearing(true);
                  try {
                    await onClear();
                    setClearOpen(false);
                  } finally {
                    setClearing(false);
                  }
                }}
                data-testid={TEST_IDS.chatClearConfirm}
              >
                {clearing ? <Spinner size="sm" /> : null}
                Delete all
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

/**
 * One row.
 *
 * The delete control is a **sibling of the link, not a child of it** — nesting
 * a button inside an anchor is invalid HTML and produces a control that
 * navigates when activated by keyboard. It reveals on hover and on
 * `focus-within`, so it is reachable by tab; `group-focus-within` rather than a
 * permanent icon because a column of trash cans reads as a page about deleting
 * things.
 */
function ChatRow({
  session,
  active,
  deleting,
  onDelete,
  onNavigate,
}: {
  session: ChatSessionSummary;
  active: boolean;
  deleting: boolean;
  onDelete: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div
      className={cn(
        "group/row relative flex items-center rounded-lg transition-colors duration-(--duration-fast) ease-out",
        active ? "bg-brand/10" : "hover:bg-surface-warm",
      )}
      data-testid={chatSessionTestId(session.id)}
    >
      <Link
        href={`/ai?c=${session.id}`}
        onClick={onNavigate}
        // The exact timestamp lives here rather than in a second line of text:
        // it is wanted rarely and costs a row of vertical space always.
        title={session.updatedAt.toLocaleString()}
        aria-current={active ? "page" : undefined}
        className={cn(
          "min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-[13px] outline-none",
          active ? "font-medium text-foreground" : "text-muted",
        )}
      >
        {session.title}
      </Link>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label={`Delete chat: ${session.title}`}
        className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity duration-(--duration-fast) ease-out group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-destructive focus-visible:opacity-100"
        data-testid={chatSessionTestId(session.id, "delete")}
      >
        {deleting ? (
          <Spinner size="sm" />
        ) : (
          <Trash2 className="size-3.5" aria-hidden />
        )}
      </button>
    </div>
  );
}
