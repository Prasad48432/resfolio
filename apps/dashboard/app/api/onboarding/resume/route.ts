import { requireSession } from "@resfolio/auth";
import { createLogger } from "@resfolio/observability";
import {
  buildProfileFromResume,
  isEmptyImport,
  resumeExtractionSchema,
} from "@resfolio/profile";
import { isOnboardingComplete } from "@resfolio/profile/server";
import { generateObject } from "ai";
import { NextResponse } from "next/server";

import {
  authorizeAiFeature,
  settleAiSpend,
  tokensFrom,
} from "@/lib/ai/billing";
import { MAX_INTAKE_OUTPUT_TOKENS } from "@/lib/ai/limits";
import {
  aiModelId,
  getChatModel,
  isAiConfigured,
  isAiEnabled,
  structuredProviderOptions,
} from "@/lib/ai/provider";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import {
  isPdfBytes,
  NOT_A_PDF,
  parseResumeUpload,
} from "@/lib/ai/resume-intake";
import { resumeIntakeSystemPrompt } from "@/lib/ai/system-prompt";

/**
 * Resume extraction for onboarding (docs/architecture/16-onboarding.md).
 *
 * **The fourth route handler, and it earns one on the upload rule rather than the
 * streaming one.** The test doc 13 sets is that a route exists only where a
 * stream is the product requirement — this is the other exception the repository
 * already recognises, stated in `/api/uploads/route.ts`: a Server Action
 * serialises its arguments, and pushing a multi-megabyte binary through that
 * path is neither efficient nor bounded (the action body limit is 1MB by
 * default, and raising it raises it for every action in the app).
 *
 * **It reads and returns; it writes nothing.** That is the same rule the two AI
 * routes keep, and here it is load-bearing rather than incidental: the profile
 * this produces is *shown to the user first*, and only
 * `applyResumeImportAction` — a Server Action they clicked — stores it. Doc 13's
 * spine (propose → review → apply) applies to onboarding exactly as it applies
 * to a profile edit, and the fact that the draft being replaced is only the seed
 * does not make replacing it without consent a better idea.
 *
 * **The PDF goes to the model as a file part, not as extracted text.** No PDF
 * parser is added: the provider's own document handling reads the page layout,
 * which is what a two-column resume needs, and it degrades to reading a scanned
 * page as an image — a text-extraction library returns nothing at all for those.
 * The bytes are held in memory for the length of the call and **never stored**:
 * nothing lands in R2, no `assets` row is written, and the file the user chose is
 * not something Resfolio keeps.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const log = createLogger("dashboard:onboarding-intake");

export async function POST(request: Request): Promise<NextResponse> {
  const session = await requireSession();
  const userId = session.user.id;

  // The same ladder as every AI route, cheapest first, plus one rung of its own.
  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "Resume import is currently disabled." },
      { status: 503 },
    );
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "Resume import isn't configured in this environment." },
      { status: 501 },
    );
  }

  // The extra rung: this is a first-run endpoint, so it closes when first run is
  // over. Not a security boundary — it writes nothing and the caller owns
  // everything involved — but a completed user has a profile with real content
  // in it, and the only thing this endpoint's output is *for* is replacing that
  // wholesale. `/sources` is the import path after onboarding.
  if (await isOnboardingComplete(userId)) {
    return NextResponse.json(
      {
        error:
          "Resume import is part of setting up your account. Use Sources to import into an existing profile.",
      },
      { status: 409 },
    );
  }

  const verdict = await checkAiRateLimit(userId, "intake");
  if (!verdict.ok) {
    return NextResponse.json(
      {
        error:
          "That's a few uploads in a row. Try again in a few minutes — or skip and fill your profile in directly.",
      },
      {
        status: 429,
        headers: { "retry-after": String(verdict.retryAfterSeconds) },
      },
    );
  }

  const form = await request.formData().catch(() => null);
  const upload = parseResumeUpload(form?.get("file"));
  if (!upload.ok) {
    return NextResponse.json(
      { error: upload.problem.message },
      { status: upload.problem.status },
    );
  }

  // Buffered once and used twice — the magic-number check and the model call —
  // because `File.arrayBuffer()` is the point at which this stops being free.
  const bytes = new Uint8Array(await upload.file.arrayBuffer());
  if (!isPdfBytes(bytes)) {
    return NextResponse.json(
      { error: NOT_A_PDF.message },
      { status: NOT_A_PDF.status },
    );
  }

  // Quota last, after the file has been proved to be a PDF: reserving before that
  // would charge a credit for choosing the wrong file, which on the very first
  // screen of the product is the worst possible place to do it (doc 14 §6).
  const gate = await authorizeAiFeature(userId, "resumeIntake");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }

  const started = Date.now();

  try {
    const { object, usage } = await generateObject({
      model: getChatModel(),
      schema: resumeExtractionSchema,
      system: resumeIntakeSystemPrompt(),
      // A file part, and the *only* untrusted content in this request. There is
      // no profile in the context and no tool the model can call, so the worst a
      // PDF carrying "ignore your instructions" achieves is a bad extraction on
      // a screen the user is about to be asked to approve — which is the same
      // structural answer the job route gives for a pasted posting.
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              data: bytes,
              mediaType: "application/pdf",
              filename: "resume.pdf",
            },
          ],
        },
      ],
      maxOutputTokens: MAX_INTAKE_OUTPUT_TOKENS,
      // Reasoning is billed from the ceiling above before a character of JSON
      // exists, and this call has nothing to show while it thinks — the same
      // blank-panel case `provider.ts` documents. Transcription is reading, not
      // deduction, so the budget was buying latency.
      providerOptions: structuredProviderOptions(),
      abortSignal: request.signal,
    });

    // The pure domain does the mapping, the validation and the counting
    // (`@resfolio/profile`'s `intake.ts`). The app supplies the account identity
    // it already has, which loses to the document on every field they share.
    const result = buildProfileFromResume(object, {
      name: session.user.name,
      email: session.user.email,
    });

    log.info(
      {
        userId,
        mode: "intake",
        model: aiModelId(),
        bytes: bytes.byteLength,
        ms: Date.now() - started,
        reasoningTokens: usage.outputTokenDetails?.reasoningTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        counts: result.counts,
        // The number worth watching: a rising drop rate means the extraction and
        // the profile schema have started disagreeing, and the user sees that as
        // a resume that imported "wrong" with nothing on screen explaining why.
        dropped: result.dropped,
      },
      "resume intake",
    );

    // **An extraction that found nothing is refunded**, and this is the one
    // outcome unique to this call site. Every other feature either produces
    // something or throws; a resume import can succeed technically and return an
    // empty profile — a scanned page the model could not read, a document that was
    // not a resume — and the client renders that as a failure ("we couldn't find
    // anything to import"). Charging for it would charge for a refusal.
    void settleAiSpend(gate.reservation, {
      outcome: isEmptyImport(result) ? "error" : "ok",
      ...tokensFrom(usage),
    });

    return NextResponse.json({
      profile: result.profile,
      counts: result.counts,
      dropped: result.dropped,
      hasSummary: result.hasSummary,
    });
  } catch (error) {
    log.error(
      { err: error, userId, model: aiModelId(), bytes: bytes.byteLength },
      "resume intake failed",
    );
    void settleAiSpend(gate.reservation, { outcome: "error" });
    // Deliberately one message for every failure mode below this line — a bad
    // scan, an unfunded key, a provider timeout. They are indistinguishable to
    // the person on the screen, and all three have the same two answers, which
    // the copy names.
    return NextResponse.json(
      {
        error:
          "We couldn't read that resume. Try a different PDF, or skip and fill your profile in directly.",
      },
      { status: 502 },
    );
  }
}
