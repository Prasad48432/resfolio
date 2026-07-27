import { requireSession } from "@resfolio/auth";
import { createLogger } from "@resfolio/observability";
import { getOrCreateProfile } from "@resfolio/profile/server";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
} from "ai";
import { NextResponse } from "next/server";

import { parseChatRequest } from "@/lib/ai/chat-request";
import { findJobDescription } from "@/lib/ai/job-analysis";
import { MAX_CHAT_OUTPUT_TOKENS } from "@/lib/ai/limits";
import {
  aiModelId,
  getChatModel,
  isAiConfigured,
  isAiEnabled,
} from "@/lib/ai/provider";
import { buildProfileContext } from "@/lib/ai/profile-context";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { chatSystemPrompt } from "@/lib/ai/system-prompt";
import { createAiTools, type AiUIMessage } from "@/lib/ai/tools";

/**
 * Resfolio AI's streaming chat endpoint (docs/architecture/13-ai-layer.md).
 *
 * **A route handler rather than a Server Action, for the one reason doc 06
 * sanctions**: an action returns a serialisable value, once. This has to hand
 * the browser a response body that is still being written — which is what
 * `useChat` consumes and what makes the first token appear in ~500ms instead of
 * the last one appearing in fifteen seconds. Every *mutation* in this feature
 * (accept a proposed change, save a job application) stays a Server Action;
 * only the stream is a route.
 *
 * The order of the guards below is the design. Each one is cheaper than the one
 * after it, and the expensive thing — the model call — happens only once
 * nothing earlier has refused:
 *
 *   session → kill switch → configured → rate limit → parse → model
 *
 * That is also, deliberately, cheapest-refusal-first: an unauthenticated flood
 * costs a cookie lookup, not an OpenAI request.
 */
export const dynamic = "force-dynamic";
/** Vercel's ceiling on this plan. A streamed response holds the connection for
 * its whole life, so this is the real wall-clock budget for one answer — not a
 * formality. Multi-step workflows (Phase 4) must therefore be a sequence of
 * short model calls streamed into one response, never one long call. */
export const maxDuration = 60;

const log = createLogger("dashboard:ai-chat");

export async function POST(request: Request): Promise<Response> {
  const session = await requireSession();
  const userId = session.user.id;

  // Kill switch (`AI_ENABLED=false`). Refused here as well as hidden in the UI:
  // turning the feature off has to actually stop requests reaching OpenAI, or
  // it isn't a cost lever. A hidden button is never the only guard.
  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "Resfolio AI is currently disabled." },
      { status: 503 },
    );
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "Resfolio AI isn't configured in this environment." },
      { status: 501 },
    );
  }

  const verdict = await checkAiRateLimit(userId, "chat");
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "You've sent a lot of requests. Try again in a few minutes." },
      {
        status: 429,
        headers: { "retry-after": String(verdict.retryAfterSeconds) },
      },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = parseChatRequest(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.problem.message },
      { status: parsed.problem.kind === "too-large" ? 413 : 400 },
    );
  }

  /**
   * The stream is opened **before** the profile read, so the work between here
   * and the first token can be reported instead of looking like a hang.
   *
   * That ordering is the entire fix for "the UI gives no indication of what the
   * AI is doing". Previously this handler did its slowest non-model work — a
   * database read and a context build — and *then* opened a stream, so the
   * browser had nothing to show for that whole window but a spinner. Opening
   * first costs nothing and turns a blank wait into two honest labels.
   *
   * Every crumb below is `transient: true`, which matters for two reasons: it
   * never lands in `message.parts`, so it is not posted back on the next turn and
   * never reaches the model as context; and it cannot linger in the transcript
   * after the answer it described has arrived.
   */
  const stream = createUIMessageStream<AiUIMessage>({
    /**
     * **Required now that the profile read happens inside the stream.** It used
     * to run before the response existed, so a failed database read became an
     * unhandled 500 that the platform logged for us. Inside `execute` it becomes
     * a stream error instead, and the SDK's default handler swallows it to a
     * generic string — which would have made a broken database read
     * indistinguishable from a model refusal, with nothing in the logs either
     * way. Returning a fixed string keeps the leak closed; the log is the point.
     */
    onError: (error) => {
      log.error(
        { err: error, userId, model: aiModelId() },
        "ai chat stream failed",
      );
      return "That didn't go through.";
    },
    execute: async ({ writer }) => {
      writer.write({
        type: "data-progress",
        data: { phase: "reading" },
        transient: true,
      });

      // Loaded **here, server-side, before the model runs** — it is not a tool
      // the model calls. Two reasons. It is needed for every message in this
      // mode, so a tool call would spend a round trip to reach a foregone
      // conclusion; and the read is user-scoped by construction, which is what
      // makes it impossible for a prompt to talk the model into reading someone
      // else's. `getOrCreateProfile` seeds on first access, matching the uploads
      // route — a brand-new user asking a question is ordinary, not an error.
      //
      // Re-read per request rather than cached across the conversation: the user
      // may have edited in another tab between two messages, and answering from
      // a stale copy is a quiet way to be wrong about someone's own career.
      const draft = await getOrCreateProfile(userId);
      const profile = buildProfileContext(draft.data);

      writer.write({
        type: "data-progress",
        data: {
          phase: "thinking",
          // A real count, from the context that was actually built. It is here
          // because it is the one piece of information that proves the read
          // happened rather than asserting it.
          detail: `${profile.itemCount} ${profile.itemCount === 1 ? "entry" : "entries"} in view`,
        },
        transient: true,
      });

      // Closed over the profile above, so the guard the tool runs and the JSON
      // the model was shown are the same snapshot. `execute` validates and
      // returns — there is no write path in this request, which is what makes
      // "the AI cannot change your profile" a property of the code rather than
      // of the prompt.
      //
      // The posting is closed over for the same reason the profile is: it is
      // already in the conversation, so making the model re-emit it as tool
      // arguments would bill for the same four thousand characters twice and
      // delay the first requirement by several seconds. `findJobDescription`
      // walks back to the most recent message long enough to be a posting, which
      // is what makes "recalculate" work as a turn of its own.
      const tools = createAiTools(draft.data, {
        jobDescription: findJobDescription(parsed.messages),
        profileJson: profile.json,
        newJobId: () => crypto.randomUUID(),
      });

      const result = streamText({
        model: getChatModel(),
        system: chatSystemPrompt(profile),
        // `tools` is passed to the conversion too, and must be: it is what
        // applies each tool's `toModelOutput`, which is what stops a previous
        // turn's full diff being re-sent — and re-billed — on every message
        // after it.
        //
        // A client could of course post a forged tool result here. It buys
        // nothing: a tool result only shapes the model's next sentence, and the
        // *apply* path is a Server Action that re-runs the guard against the
        // real profile.
        messages: await convertToModelMessages(parsed.messages, { tools }),
        tools,
        // Text, then a tool call, then a closing sentence — three steps, one
        // more than before, and the extra one is a **recovery** step rather than
        // a retry loop. The guard legitimately refuses changes (asking to add a
        // technology is refused by design), and with a two-step ceiling a turn
        // whose every change was refused had no step left in which to say so:
        // the user got an empty-looking answer for a request the model had
        // understood correctly. One more step lets it either propose something
        // legal or explain what it cannot do.
        stopWhen: stepCountIs(3),
        // Reasoning tokens are spent from this budget before a single visible
        // character appears, so a ceiling set for prose silently truncates a
        // turn that has to think (see `limits.ts`).
        maxOutputTokens: MAX_CHAT_OUTPUT_TOKENS,
        // Cancellation is a cost control, not just a UX affordance: `useChat`'s
        // stop() and a closed tab both abort this request, and without the
        // signal the model would keep generating — and billing — into nothing.
        abortSignal: request.signal,
        // The usage seam (doc 13). Token counts are logged structured today; an
        // `ai_usage` table or a billing meter later reads this exact call site
        // rather than needing one to be found and added.
        onFinish: ({ usage, finishReason }) => {
          if (finishReason === "length") {
            // The one finish reason the user has to be told about, because it is
            // indistinguishable from a crash otherwise: the turn stopped
            // mid-thought and whatever is on screen is all there will be. It is
            // also actionable — asking for fewer things at once works.
            writer.write({
              type: "data-progress",
              data: { phase: "truncated" },
              transient: true,
            });
          }

          log.info(
            {
              userId,
              mode: "chat",
              model: aiModelId(),
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              totalTokens: usage.totalTokens,
              // Reasoning is billed, invisible, and counted *inside*
              // `outputTokens` — which is what exhausts the output ceiling on a
              // tool-calling turn before any text is emitted. Logged separately
              // from the tokens that became text, because a rise in one of those
              // two means something completely different from a rise in the other.
              reasoningTokens: usage.outputTokenDetails.reasoningTokens,
              textTokens: usage.outputTokenDetails.textTokens,
              finishReason,
              // The profile is re-sent on every turn, so it is the largest
              // recurring share of input tokens. Logging its size is what makes
              // a rising bill diagnosable without guessing.
              profileChars: profile.json.length,
            },
            "ai completion",
          );
        },
        onError: ({ error }) => {
          // Errors raised *during* the stream can't become a status code — the
          // response headers are long gone — so this is the only place they are
          // recorded. The client sees the stream end and renders its error
          // state.
          log.error(
            { err: error, userId, model: aiModelId() },
            "ai stream failed",
          );
        },
      });

      writer.merge(toUIMessageStream({ stream: result.stream, tools }));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
