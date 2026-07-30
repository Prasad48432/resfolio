import { requireSession } from "@resfolio/auth";
import { createLogger } from "@resfolio/observability";
import { getOrCreateProfile } from "@resfolio/profile/server";
import { streamObject } from "ai";
import { NextResponse } from "next/server";

import {
  authorizeAiFeature,
  settleAiSpend,
  tokensFrom,
} from "@/lib/ai/billing";
import { coverLetterSchema } from "@/lib/ai/cover-letter";
import { parseJobRequest } from "@/lib/ai/job-analysis";
import { MAX_OBJECT_OUTPUT_TOKENS } from "@/lib/ai/limits";
import { buildProfileContext } from "@/lib/ai/profile-context";
import {
  aiModelId,
  getChatModel,
  isAiConfigured,
  isAiEnabled,
  structuredProviderOptions,
} from "@/lib/ai/provider";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { coverLetterSystemPrompt } from "@/lib/ai/system-prompt";

/**
 * Cover letters (docs/architecture/13-ai-layer.md, Phase 6).
 *
 * **The third route handler, and the strongest case for one in the whole
 * feature.** The test has not moved — a route exists here only where a stream is
 * the product requirement — and this output is prose. Watching a letter get
 * written is not a progress indicator standing in for one; it is the thing itself,
 * arriving in the order a person reads it. Thirty seconds of spinner followed by a
 * page of text is a worse product than the same text appearing as it is composed,
 * and that is true of nothing else this feature produces.
 *
 * Phase 5 could not stream (its guard needs the Profile's structured content, so
 * the review has to be built server-side); this one can, because **its
 * verification runs against a text haystack the client already holds** — the same
 * `context.json` Phase 4 ships as a keyword haystack, unioned with the posting the
 * user typed. Nothing new crosses the boundary to make streaming possible.
 *
 * Guard order is the same ladder as the other two routes, under its own `letter`
 * mode. This route reads and streams; it writes nothing. **Nothing is persisted at
 * all in Phase 6** — the letter lives in the browser until it is copied. Storage is
 * a column on the job application, which lands with Phase 7.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = createLogger("dashboard:ai-letter");

export async function POST(request: Request): Promise<Response> {
  const session = await requireSession();
  const userId = session.user.id;

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

  const verdict = await checkAiRateLimit(userId, "letter");
  if (!verdict.ok) {
    return NextResponse.json(
      {
        error:
          "You've drafted a few letters already. Try again in a few minutes — or edit the one you have.",
      },
      {
        status: 429,
        headers: { "retry-after": String(verdict.retryAfterSeconds) },
      },
    );
  }

  // The same boundary the job route uses, deliberately: the request body is
  // identical (`{ jobDescription }`), so a second copy of the size rule would be
  // a second place for it to drift. **The recipient is not in it** — the platform
  // composes the greeting in the browser, so the name a user types for the letter
  // never reaches the server, the model, or a log.
  const body = await request.json().catch(() => null);
  const parsed = parseJobRequest(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.problem.message },
      { status: parsed.problem.kind === "too-large" ? 413 : 400 },
    );
  }

  // Quota last, before the model and after everything cheaper (doc 14 §6). A
  // refusal is still a status code here, which is why it happens before the
  // stream: `useObject` renders `{ error }` and the copy names the reset date.
  const gate = await authorizeAiFeature(userId, "coverLetter");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }

  const draft = await getOrCreateProfile(userId);
  const profile = buildProfileContext(draft.data);

  const result = streamObject({
    model: getChatModel(),
    schema: coverLetterSchema,
    system: coverLetterSystemPrompt(profile),
    // Untrusted third-party text, delimited, never spliced into the system
    // prompt — the same posture as the job route. The guarantee remains
    // structural rather than typographic: no tools, no write path, so a
    // successful injection buys a bad letter on the user's own screen.
    prompt: `<job-description>\n${parsed.jobDescription}\n</job-description>`,
    // The object ceiling, not the shared default: the reasoning a letter needs is
    // spent from this budget before the first word of it is written, and a
    // structured generation stopped by the ceiling fails validation entirely
    // rather than arriving short (see `limits.ts`).
    maxOutputTokens: MAX_OBJECT_OUTPUT_TOKENS,
    // **The one route where this is a genuine trade rather than a free win.**
    // Structured output emits nothing while the model reasons, so the letter's
    // first sentence appears twenty seconds after the button regardless of how
    // good the letter is — and lowering the reasoning budget is what closes most
    // of that gap (see `provider.ts` for the measurement). Composing four
    // paragraphs is more of a writing task than the job analysis' classification
    // is, so if letters get noticeably blander this is the line to reconsider
    // first; the measurement to beat is 16s to first word.
    providerOptions: structuredProviderOptions(),
    abortSignal: request.signal,
    onFinish: ({ usage, object, error, finishReason }) => {
      log.info(
        {
          userId,
          mode: "letter",
          err: error,
          finishReason,
          reasoningTokens: usage.outputTokenDetails?.reasoningTokens,
          model: aiModelId(),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          profileChars: profile.json.length,
          jdChars: parsed.jobDescription.length,
          // Undefined when the final object failed validation. Worth logging:
          // that is the one failure the client renders as a half-written letter
          // rather than as an error.
          paragraphs: object?.body.length,
        },
        "ai cover letter",
      );

      // **The refund case that matters most in this feature.** `object` is
      // undefined when the final document failed to validate — the failure the
      // client renders as a half-written letter rather than as an error — and that
      // is a call billed in full for something the user cannot use. `error` covers
      // the same ground from the other side.
      const failed = error !== undefined || object === undefined;
      void settleAiSpend(gate.reservation, {
        outcome: failed ? "error" : "ok",
        ...tokensFrom(usage),
      });
    },
    onError: ({ error }) => {
      log.error({ err: error, userId, model: aiModelId() }, "ai letter failed");
      // Idempotent on the reservation id, so an error that also reaches
      // `onFinish` writes one row.
      void settleAiSpend(gate.reservation, { outcome: "error" });
    },
  });

  return result.toTextStreamResponse();
}
