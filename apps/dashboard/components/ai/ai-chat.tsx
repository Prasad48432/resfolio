"use client";

import { useChat } from "@ai-sdk/react";
import {
  Button,
  Marker,
  MarkerContent,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  Textarea,
} from "@resfolio/ui";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { MatrixSpinner } from "@/components/status/matrix-loader";
import { WorkingText } from "@/components/status/working-text";
import {
  COMPOSER_COUNTER_THRESHOLD,
  MAX_CHARS_PER_MESSAGE,
} from "@/lib/ai/limits";
import type { JobFacts } from "@/lib/ai/job-facts";
import {
  looksLikeNewPosting,
  postingsInTranscript,
  type PostingInChat,
} from "@/lib/ai/second-posting";
import type { WorkKind } from "@/lib/ai/status-words";
import type { AiPhase, AiProgress, AiUIMessage } from "@/lib/ai/tools";
import { TEST_IDS } from "@/lib/testids";

import { AiMessage } from "./ai-message";
import { AiSuggestions } from "./ai-suggestions";
import type { TailorTarget } from "./resume-tailor";
import { useAutosize } from "./use-autosize";

/**
 * The chat surface (docs/architecture/13-ai-layer.md).
 *
 * The client half of the streaming path: `useChat` POSTs to `/api/ai/chat` and
 * consumes the UI message stream, so text lands token by token rather than in one
 * block at the end. Everything here is transport, layout and affordances — the
 * *rendering* of a message lives in `AiMessage`, keyed on part type.
 *
 * ## The layout is three rows, and the middle one is the only thing that scrolls
 *
 * ```
 * flex column, height inherited from the shell   ← min-h-0, so it can be shorter
 *   ├─ messages   flex-1 min-h-0 overflow-y-auto    than its content
 *   └─ composer   shrink-0
 * ```
 *
 * That shape only works because the shell now hands down a *definite* height
 * (`app-shell.tsx`). It is worth being precise about which class does what,
 * because removing any one of them reproduces a specific bug that was reported:
 *
 * - **`min-h-0` on this column and on the message region.** A flex item's default
 *   `min-height: auto` refuses to shrink below its content, so without these the
 *   message list sets the height of everything above it: the column grows past the
 *   viewport, the page gains a scrollbar, and the composer is pushed off the
 *   bottom of the screen. This is the single cause of "the input moves down" and
 *   "scrolling the chat scrolls the page" — one property, two symptoms.
 * - **`flex-1` on the message region, `shrink-0` on the composer.** The composer
 *   is the only element here whose height is content-driven (it grows as the
 *   textarea does), so it must be the one that never gives ground; the message
 *   region absorbs whatever is left. Reversed, a long message squeezes the
 *   composer to nothing.
 * - **`overflow-hidden` on the column.** Belt to the `min-h-0` braces: it
 *   guarantees that nothing here can ever paint into the shell's scroll container
 *   and produce a second scrollbar next to the first.
 *
 * The composer therefore grows *upward* into the message area — the messages get
 * shorter, the input stays put — which is what "stable at the bottom" actually
 * requires. It is not sticky positioning; it is a row in a bounded grid, which
 * cannot come unstuck.
 *
 * ## States are the request's, never a timer's
 *
 * `status` is the SDK's and is used as-is. `submitted` (sent, nothing back yet)
 * and `streaming` (tokens arriving) are genuinely different moments — during the
 * second the arriving text *is* the progress indicator, which is why no label is
 * shown then. The gap before the first token is filled by `progress`, which comes
 * from `data-progress` parts the route writes at real transitions (a database read
 * beginning, a model call being dispatched). Nothing here is on a timer and
 * nothing describes work the server has not reported.
 *
 * Errors are shown as a `Marker` in the transcript rather than a toast. A failed
 * answer is part of the conversation's history — it belongs where the answer would
 * have been, next to the question that caused it, and it must not evaporate after
 * four seconds (doc 08: toasts own events, persistent state stays on the page).
 */

/** The composer's ceiling, in pixels: about eight lines at this type size. Past
 * that the textarea scrolls internally rather than eating the transcript — a
 * composer taller than the conversation it is part of has stopped being a
 * composer. */
const MAX_COMPOSER_HEIGHT = 200;

/**
 * The bank each *working* phase draws its status word from
 * (`lib/ai/status-words.ts`). Still one word per phase the server actually
 * reported — the rotation happens inside a bank, so nothing here claims a stage
 * that has not begun.
 *
 * `truncated` is deliberately absent: it is not work in progress, it is a
 * finished turn reporting how it ended, so it keeps a plain sentence below.
 */
const PHASE_KINDS: Record<Exclude<AiPhase, "truncated">, WorkKind> = {
  reading: "reading",
  thinking: "thinking",
};

const TRUNCATED_LABEL = "That answer was cut short.";

export function AiChat({
  profileIsEmpty,
  sessionId,
  initialMessages = [],
  initialInput,
  resumes,
  jobFacts,
  onTurnComplete,
  onJobSaved,
  onStartNewChat,
}: {
  profileIsEmpty: boolean;
  /** The transcript this chat writes to. Minted by the workspace when a new
   * conversation opens, so the composer never waits on a round trip for an id
   * and the first save is an upsert like every later one. */
  sessionId: string;
  /** A saved transcript, when one was opened. Read once, on mount — `useChat`
   * owns the messages after that, which is why the workspace keys this
   * component on the session. */
  initialMessages?: AiUIMessage[];
  /** Text this chat opens with, unsent — the posting carried over from a
   * conversation it did not belong in. Everything else opens empty. */
  initialInput?: string;
  /** The user's resumes, passed through to a match card's optimise destinations. */
  resumes?: TailorTarget[];
  /** What has already been done with each job in this conversation — enhanced,
   * tailored, applied to. Passed straight through to the match cards, which is
   * where every "already done" state lives — see `JobMatchCard`. */
  jobFacts?: ReadonlyMap<string, JobFacts>;
  /** Persist. Called once per settled turn, never per token. */
  onTurnComplete?: (messages: AiUIMessage[]) => void;
  /** A job match in this transcript finished writing its row. The workspace
   * uses it to refresh the artefact panel — the panel reads the database, so it
   * must not be asked to render a job before the row exists. */
  onJobSaved?: () => void;
  /** Move the pending text into a brand-new conversation. The workspace mints
   * the id; this component only knows what should be carried. */
  onStartNewChat?: (seed: string) => void;
}) {
  const [input, setInput] = useState(initialInput ?? "");
  const [progress, setProgress] = useState<AiProgress | null>(null);

  /**
   * The posting this conversation is already about, when the composer holds a
   * different one — see `lib/ai/second-posting.ts`.
   *
   * **A block, not a warning.** This started as a nudge with a "Send here
   * anyway" beside it, which is the wrong shape: the reason a second job does
   * not belong here is structural, not advisory. One conversation has one
   * artefact panel, one resume slot and one score, so a second posting does not
   * produce a worse experience — it produces a chat that is lying about which
   * job it describes. The server enforces the same rule in the tool, so
   * "anyway" would only have meant "spend a model call to be told no".
   */
  const [secondPosting, setSecondPosting] = useState<PostingInChat | null>(null);

  // Typed with the app's own message shape, so a `tool-proposeProfileChanges`
  // part arrives at `AiMessage` already narrowed to a `ProfileChangeReview` and a
  // `data-progress` part to a real `AiProgress`.
  const { messages, sendMessage, status, error, stop, regenerate } =
    useChat<AiUIMessage>({
      // The SDK keys its own state on this, and the workspace remounts on it
      // too — two conversations must never share a transcript, and an id that
      // changed underneath a mounted chat would do exactly that.
      id: sessionId,
      messages: initialMessages,
      transport: new DefaultChatTransport({ api: "/api/ai/chat" }),
      // Progress crumbs are transient — they never enter `message.parts`, so they
      // are not posted back on the next turn and never reach the model. They live
      // in component state for exactly as long as the turn they describe.
      onData: (part) => {
        if (part.type === "data-progress") {
          setProgress(part.data);
        }
      },
    });

  const busy = status === "submitted" || status === "streaming";

  /**
   * The message-length ceiling, which for this composer is the **job-description**
   * ceiling (`limits.ts`): pasting a posting is the largest legitimate thing
   * anyone types here, so the two are one number.
   *
   * **It is enforced by refusing to send, never by a `maxLength` on the
   * textarea**, and that is the whole point of this block. `maxLength` truncates
   * a paste silently — the browser drops the tail with no event, no message and no
   * visual change beyond a caret that stopped moving — so an over-long posting
   * became an analysis of its first two-thirds, confidently reported as an
   * analysis of the job. That is exactly the failure `chat-request.ts` refuses on
   * the server ("rejected, never truncated"); doing it in the browser instead of
   * the route did not make it acceptable, it made it invisible.
   *
   * So the text stays whole, the counter appears before it matters, and the send
   * button is the thing that says no.
   */
  const length = input.length;
  const overLimit = length > MAX_CHARS_PER_MESSAGE;
  const showCount = length >= COMPOSER_COUNTER_THRESHOLD;

  const canSend = input.trim().length > 0 && !overLimit && !busy;
  const isFresh = messages.length === 0 && !busy && !error;

  const composerRef = useAutosize(input, MAX_COMPOSER_HEIGHT);

  // Cleared when a turn ends, not when the next one starts: a crumb left on
  // screen beside a finished answer is describing work that is over. `truncated`
  // is the exception — it explains the answer the user is looking at, so it
  // survives until they send something else.
  useEffect(() => {
    if (status === "ready" || status === "error") {
      setProgress((current) =>
        current?.phase === "truncated" ? current : null,
      );
    }
  }, [status]);

  /**
   * Persist the transcript when a turn settles.
   *
   * **An effect on `status`, not `useChat`'s `onFinish`.** That callback is
   * handed the one message that just finished, and what is saved is the whole
   * conversation — reassembling it there means keeping a second copy of the
   * array in sync with the SDK's. Reacting to the status edge reads the same
   * `messages` the screen is rendering, which is by definition the thing to
   * store.
   *
   * `error` counts as settled: a turn that failed still leaves the user's
   * question in the transcript, and losing the question because the answer
   * failed is the worse of the two failures.
   *
   * **The trigger is the status *edge*, not the message count.** `messages` is a
   * new array on every token, so the effect runs constantly and needs something
   * to fire on; a count would be the obvious choice and is wrong, because
   * `regenerate()` replaces the last answer without adding a message — the
   * rewrite would never be saved. Busy → settled happens exactly once per turn,
   * whatever the turn did to the array.
   */
  const wasBusyRef = useRef(false);
  useEffect(() => {
    const settled = status === "ready" || status === "error";

    if (wasBusyRef.current && settled && messages.length > 0) {
      onTurnComplete?.(messages);
    }

    wasBusyRef.current = status === "submitted" || status === "streaming";
  }, [status, messages, onTurnComplete]);

  function send() {
    setProgress(null);
    setSecondPosting(null);
    sendMessage({ text: input.trim() });
    setInput("");
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) {
      return;
    }

    /**
     * The one thing checked before a message leaves: is this a *second* job?
     *
     * Pure and local — no request, no model call — which is the point. A check
     * that cost a round trip to save a round trip would be the problem wearing a
     * different hat. See `lib/ai/second-posting.ts` for what does and does not
     * count, and note that the transcript is read live rather than remembered:
     * a posting analysed two turns ago is in `messages` already.
     *
     * Ordinary conversation is untouched — this only ever fires on something
     * that reads as a whole posting or a bare job link.
     */
    const existing = looksLikeNewPosting(
      input.trim(),
      postingsInTranscript(messages),
    );
    if (existing) {
      setSecondPosting(existing);
      return;
    }

    send();
  }

  /** A suggestion sends immediately. Dropping the text into the composer for the
   * user to press send again would be a second click for no decision — they
   * already chose by clicking the thing. */
  function pickSuggestion(text: string) {
    if (busy) {
      return;
    }
    setProgress(null);
    sendMessage({ text });
    setInput("");
  }

  // Enter sends, Shift+Enter breaks the line. This is a composer, not a form
  // field: the common action is sending, and a multi-line instruction is the
  // exception that earns the modifier.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid={TEST_IDS.aiChat}
    >
      {/* The Provider owns scroll state and must wrap the whole scroller: it is
          what keeps the view pinned to the newest token while a reply streams,
          and what lets go the moment the user scrolls up to read something. */}
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport aria-label="Conversation">
            <MessageScrollerContent className="px-1 pt-1 pb-4">
              {isFresh ? (
                <MessageScrollerItem>
                  {profileIsEmpty ? (
                    // Answering this here rather than letting the model say it
                    // saves a paid round trip to deliver news the server
                    // already had, and gives the user the link that fixes it.
                    <EmptyState
                      icon={Sparkles}
                      title="Your profile is still the starter template"
                      description="Resfolio AI works from what's in your profile — it never invents experience. Replace the example entries and come back."
                      action={
                        <Button asChild size="sm">
                          <Link href="/profile">Edit your profile</Link>
                        </Button>
                      }
                      data-testid={TEST_IDS.aiProfileEmpty}
                    />
                  ) : (
                    <AiSuggestions onPick={pickSuggestion} />
                  )}
                </MessageScrollerItem>
              ) : null}

              {messages.map((message, index) => (
                <MessageScrollerItem key={message.id} messageId={message.id}>
                  <AiMessage
                    message={message}
                    // Only the last message can still be arriving. Any earlier
                    // one that renders nothing is finished and empty, which is
                    // the case worth explaining.
                    settled={!busy || index < messages.length - 1}
                    chatSessionId={sessionId}
                    resumes={resumes}
                    jobFacts={jobFacts}
                    onJobSaved={onJobSaved}
                    onStartNewChat={onStartNewChat}
                  />
                </MessageScrollerItem>
              ))}

              {/* Real work, reported. Shown while nothing has come back yet —
                  once text is streaming, the text is the indicator and a label
                  beside it would be a caption on something already visible.

                  The same `MatrixSpinner` as the still-arriving marker in
                  `AiMessage`, deliberately: this and that one are one continuous
                  wait handed off at the moment the assistant message opens, and
                  an indicator that changes shape halfway through reads as
                  something having gone wrong. */}
              {status === "submitted" ? (
                <MessageScrollerItem>
                  <Marker data-testid={TEST_IDS.aiThinking}>
                    <MatrixSpinner rows={4} cols={4} />
                    {/* The word rotates within the phase the server reported;
                        the shimmer and the detail clause are `WorkingText`'s.
                        Before any crumb arrives the only true thing is that the
                        request is out, which is its own bank. */}
                    <MarkerContent>
                      <WorkingText
                        kind={
                          progress && progress.phase !== "truncated"
                            ? PHASE_KINDS[progress.phase]
                            : "sending"
                        }
                        detail={progress?.detail}
                      />
                    </MarkerContent>
                  </Marker>
                </MessageScrollerItem>
              ) : null}

              {progress?.phase === "truncated" && !busy ? (
                <MessageScrollerItem>
                  <Marker data-testid={TEST_IDS.aiTruncated}>
                    <MarkerContent>
                      {TRUNCATED_LABEL} There was more to work through
                      than fits in one answer — ask for a few items at a time
                      and it will get through them.
                    </MarkerContent>
                  </Marker>
                </MessageScrollerItem>
              ) : null}

              {error ? (
                <MessageScrollerItem>
                  <Marker
                    className="text-destructive"
                    data-testid={TEST_IDS.aiError}
                  >
                    <MarkerContent>
                      That didn&apos;t go through.{" "}
                      <button
                        type="button"
                        className="underline underline-offset-3"
                        onClick={() => void regenerate()}
                      >
                        Try again
                      </button>
                    </MarkerContent>
                  </Marker>
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" />
        </MessageScroller>
      </MessageScrollerProvider>

      {/* `shrink-0`: the one row here whose height is content-driven, so the one
          row that must never be compressed. It grows upward as the textarea does
          and its bottom edge never moves. */}
      <div className="shrink-0 pt-3">
        {/* Above the composer rather than in the transcript, because nothing has
            been sent: this is about the message still in the box, and putting it
            in the conversation would make it look like a turn that happened. */}
        {secondPosting ? (
          <div
            className="mb-2 flex flex-col gap-2 rounded-xl border border-brand/40 bg-brand/5 p-3 text-[13px]"
            data-testid={TEST_IDS.secondPosting}
          >
            <p>
              This chat covers{" "}
              <span className="font-medium">{secondPosting.title}</span>.
            </p>
            <p className="text-xs text-muted">
              One chat, one job — its match, its resume and its letter all
              describe that one. Your posting is kept; the new chat opens with it
              ready to send.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  // The text goes with it. A new chat that made the user paste
                  // the posting again would be a worse outcome than the one this
                  // is preventing.
                  onStartNewChat?.(input.trim());
                  setSecondPosting(null);
                }}
                data-testid={TEST_IDS.secondPostingNewChat}
              >
                Start a new chat with this
              </Button>
              {/* Not "send anyway". The server refuses a second analysis in the
                  same conversation, so that button could only ever have meant
                  "spend a call to be told no" — this one just puts the composer
                  back so the text can be edited into an ordinary question. */}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setSecondPosting(null)}
                data-testid={TEST_IDS.secondPostingCancel}
              >
                Keep editing
              </Button>
            </div>
          </div>
        ) : null}

        <form
          onSubmit={submit}
          // The border is on the wrapper, not the textarea, so the whole
          // composer reads as one control with the send button inside it —
          // rather than a field with a button parked next to it.
          className="flex items-end gap-2 rounded-2xl border border-border bg-surface/60 p-2 transition-colors duration-(--duration-fast) ease-out focus-within:border-brand/40"
        >
          <Textarea
            ref={composerRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            // No `maxLength` — see `overLimit` above. It would truncate a pasted
            // posting without saying so.
            aria-invalid={overLimit || undefined}
            placeholder="Ask Resfolio AI…"
            aria-label="Message Resfolio AI"
            // No chrome of its own — the wrapper is the control. The height
            // ceiling is deliberately *not* also a CSS `max-h`: `useAutosize`
            // owns it, and a second copy of the number in a class is a value
            // that drifts from the one doing the work.
            className="min-h-0 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:border-0 focus-visible:ring-0"
            data-testid={TEST_IDS.aiInput}
          />
          {busy ? (
            // Stop is not a courtesy. The request carries an abort signal to the
            // model, so cancelling actually stops generation — and therefore
            // stops billing for tokens nobody is going to read.
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="shrink-0"
              onClick={() => stop()}
              aria-label="Stop generating"
              data-testid={TEST_IDS.aiStop}
            >
              <Square className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="shrink-0"
              disabled={!canSend}
              aria-label="Send message"
              data-testid={TEST_IDS.aiSend}
            >
              <ArrowUp className="size-4" aria-hidden />
            </Button>
          )}
        </form>

        <div className="flex items-start justify-between gap-3 px-2 pt-1.5">
          <p className="text-[11px] text-muted">
            {overLimit ? (
              // Named as a job description, because that is what anything this
              // long is. "Message too long" would be true and useless — the user
              // did not write 12,000 characters, they pasted a careers page.
              <span
                className="text-destructive"
                data-testid={TEST_IDS.aiInputTooLong}
              >
                That&apos;s longer than a job posting —{" "}
                {(length - MAX_CHARS_PER_MESSAGE).toLocaleString()} characters
                over. Paste the role, responsibilities and requirements; leave
                out benefits and company history.
              </span>
            ) : (
              <>
                Resfolio AI works from your profile and can propose changes —
                nothing is saved until you accept it.
              </>
            )}
          </p>
          {showCount ? (
            <p
              className={`shrink-0 text-[11px] tabular-nums ${
                overLimit ? "text-destructive" : "text-muted"
              }`}
              data-testid={TEST_IDS.aiInputCount}
            >
              {length.toLocaleString()} /{" "}
              {MAX_CHARS_PER_MESSAGE.toLocaleString()}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
