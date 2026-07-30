"use client";

import type { Profile, ResumeImportResult } from "@resfolio/profile";
import { Button, Card, Spinner } from "@resfolio/ui";
import { ArrowRight, FileText, Linkedin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FadeIn } from "@/components/motion/motion";
import { ImportSummary } from "@/components/onboarding/import-summary";
import { ResumeDropzone } from "@/components/onboarding/resume-dropzone";
import { ResumeScan } from "@/components/onboarding/resume-scan";
import {
  applyResumeImportAction,
  skipOnboardingAction,
} from "@/app/(onboarding)/onboarding/actions";
import { TEST_IDS } from "@/lib/testids";

/**
 * Onboarding's one client island (docs/architecture/16-onboarding.md).
 *
 * ## The state machine, and why it is explicit
 *
 * `choose → scanning → review → applying`, plus the two terminal exits (both a
 * `router.replace` into `/profile`). It is one discriminated union rather than four
 * booleans, because the states are genuinely exclusive and the bug a boolean set
 * produces here is the worst kind available on this screen: two panels rendered at
 * once, or a dropzone still live while an upload is in flight.
 *
 * ## The two round trips
 *
 * **Extract, then apply — and they are separate on purpose.** The route reads the
 * PDF and returns a Profile without storing anything; the action stores it. That
 * is doc 13's propose → review → apply spine, held to even though the draft being
 * replaced is only the seed. It also buys the honest loading sequence: two phases
 * on screen because there are two calls, rather than a five-step animation over one
 * (`ResumeScan`, `status-words.ts`).
 *
 * The extracted `Profile` round-trips through the browser, which is the same
 * posture the profile editor's autosave has — the action re-parses it with
 * `profileSchema`, and the only thing tampering achieves is writing your own
 * profile, which is what the next screen is for. What it buys is that the counts
 * this screen showed were computed from the exact object being stored.
 *
 * ## Skip, and `busy`
 *
 * Skip is rendered in every state and **disabled whenever work is in flight** —
 * the scan, the apply, or a skip already sent. It is not a cancel: it marks
 * onboarding done and leaves for `/profile`, so pressing it mid-scan would start a
 * navigation while a fetch is still running and leave the user unable to say which
 * of the two decided what their profile now contains.
 *
 * The trade is real and was made deliberately: someone who changes their mind
 * eight seconds into a twenty-second scan now waits for it to finish before they
 * can leave. That is the cost of the screen only ever doing one thing at a time,
 * and the alternative — two overlapping writes racing to define a brand-new
 * profile — is the worse of the two. A failed or empty scan returns to `choose`
 * with everything enabled again, so nobody is ever stuck.
 *
 * **`busy` is derived, never a fourth piece of state.** It is a function of the
 * stage and the transition, so a control cannot be left enabled by a code path
 * that forgot to set a flag — which is exactly how this kind of bug appears in the
 * first place.
 */

type Stage =
  | { name: "choose" }
  | { name: "scanning"; fileName: string }
  | { name: "review"; result: ImportPayload; fileName: string }
  | { name: "applying" };

/** What the extraction route answers with. The `Profile` is opaque to this
 * component — it is carried from the route to the action and never read here,
 * which is what keeps the client out of the business of understanding a profile. */
interface ImportPayload extends Pick<
  ResumeImportResult,
  "counts" | "dropped" | "hasSummary"
> {
  profile: Profile;
}

export function OnboardingFlow({
  firstName,
  resumeImportAvailable,
}: {
  firstName: string;
  /** False when this environment has no AI credential or has `AI_ENABLED=false`.
   * The upload card is not rendered at all — see the page's comment. */
  resumeImportAvailable: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ name: "choose" });
  const [leaving, startLeaving] = useTransition();

  /**
   * Whether anything is running. Derived from the two sources of truth rather
   * than tracked separately: the stage covers the two waits the user can see
   * (the scan, the apply) and `leaving` covers a Server Action already sent.
   * Every control on the screen reads this one value, so a new stage cannot
   * leave a button live by omission.
   */
  const busy =
    leaving || stage.name === "scanning" || stage.name === "applying";

  /**
   * Both exits, in one place. `router.replace`, never `push`: onboarding is not
   * re-enterable (the layout redirects a completed user away), so leaving it in
   * the history means Back lands on a URL that immediately bounces — which reads
   * as the Back button being broken.
   */
  function leave() {
    router.replace("/profile");
  }

  async function upload(file: File) {
    setStage({ name: "scanning", fileName: file.name });

    const body = new FormData();
    body.set("file", file);

    let response: Response;
    try {
      response = await fetch("/api/onboarding/resume", {
        method: "POST",
        body,
      });
    } catch {
      // A network failure, an aborted navigation, a dropped connection. There is
      // nothing to report but the fact, and the two answers are on screen.
      setStage({ name: "choose" });
      toast.error(
        "The upload didn't go through. Check your connection and try again.",
      );
      return;
    }

    if (!response.ok) {
      // Every refusal this route makes carries its own sentence (`{ error }`), and
      // showing it is the whole reason those sentences name the limit — a generic
      // failure here would leave the user guessing between a wrong file, a file too
      // large, and a bad scan.
      const detail = await response
        .json()
        .then((payload: { error?: string }) => payload.error)
        .catch(() => undefined);
      setStage({ name: "choose" });
      toast.error(
        detail ?? "We couldn't read that resume. Try a different PDF.",
      );
      return;
    }

    const payload = (await response.json()) as ImportPayload;

    // Nothing usable came back. Treated as a failure rather than shown as an empty
    // summary: "we found 0 roles" over a Continue button is a screen that asks the
    // user to accept nothing.
    const empty =
      !payload.hasSummary &&
      Object.values(payload.counts).every((count) => count === 0);
    if (empty) {
      setStage({ name: "choose" });
      toast.error(
        "We couldn't find anything to import in that file. Try a different PDF, or skip and fill your profile in directly.",
      );
      return;
    }

    setStage({ name: "review", result: payload, fileName: file.name });
  }

  function apply(payload: ImportPayload) {
    setStage({ name: "applying" });
    startLeaving(async () => {
      const result = await applyResumeImportAction({
        profile: payload.profile,
      });
      if (!result.ok) {
        setStage({ name: "review", result: payload, fileName: "" });
        toast.error(result.error);
        return;
      }
      toast.success("Your profile is ready — have a look through it.");
      leave();
    });
  }

  function skip() {
    startLeaving(async () => {
      const result = await skipOnboardingAction({});
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      leave();
    });
  }

  return (
    <div
      className="flex w-full max-w-lg flex-col items-center gap-8"
      data-testid={TEST_IDS.onboardingPage}
      data-stage={stage.name}
    >
      {stage.name === "choose" ? (
        <FadeIn className="flex w-full flex-col items-center gap-8">
          <Heading
            title={
              firstName ? (
                <>
                  Welcome, <span className="text-brand">{firstName}</span>
                </>
              ) : (
                "Welcome to Resfolio"
              )
            }
            description="Your profile is the source of truth behind every resume, portfolio and site you publish. Let's fill it in."
          />

          <div className="flex w-full flex-col gap-3">
            {resumeImportAvailable ? (
              <Card className="flex flex-col gap-4 p-5">
                <OptionHeader
                  icon={<FileText className="size-4" aria-hidden />}
                  title="Start from your resume"
                  description="We'll read it and fill in your experience, education, projects and skills. You'll see what we found before anything is saved."
                  recommended
                />
                {/* Disabled while a skip is in flight: the two are the same
                    choice made twice, and the one that lands second would write
                    over the first. */}
                <ResumeDropzone
                  onFile={(file) => void upload(file)}
                  disabled={busy}
                />
              </Card>
            ) : null}

            {/* Coming soon, and rendered as a real row rather than hidden.
                `/sources` hides its unavailable providers on the principle that a
                greyed card is an advert on a page someone came to work on — this
                screen is the exception, because it is the one place a user is
                deciding *how* to start, and "the other way is coming" is the
                answer to "is this all there is?". It is inert: no handler, no
                focus, `aria-disabled` so it is announced as unavailable rather
                than as a broken button. */}
            <Card
              className="flex flex-col gap-3 p-5 opacity-60"
              aria-disabled
              data-testid={TEST_IDS.onboardingLinkedIn}
            >
              <OptionHeader
                icon={<Linkedin className="size-4" aria-hidden />}
                title="Import from LinkedIn"
                description="Paste your LinkedIn URL and we'll bring your profile across."
                badge="Coming soon"
              />
            </Card>
          </div>

          <SkipButton onClick={skip} disabled={busy} pending={leaving} />
        </FadeIn>
      ) : null}

      {stage.name === "scanning" ? (
        <FadeIn className="flex w-full flex-col items-center gap-8">
          <Heading
            title="Reading your resume"
            description="This usually takes about twenty seconds. Nothing is saved until you've seen it."
          />
          <ResumeScan kind="scanning" fileName={stage.fileName} />
          {/* Greyed for the whole scan, and deliberately still rendered: a
              control that vanishes reads as the product having taken the choice
              away, where a disabled one reads as "not right now". */}
          <SkipButton
            onClick={skip}
            disabled={busy}
            pending={leaving}
            label="Skip and do it myself"
          />
        </FadeIn>
      ) : null}

      {stage.name === "review" ? (
        <FadeIn className="flex w-full flex-col items-center gap-8">
          <Heading
            title="Here's what we found"
            description="Nothing is saved yet. Add this to your profile and you can edit every word of it."
          />

          <Card className="w-full p-5">
            <ImportSummary
              result={stage.result}
              name={stage.result.profile.basics.name}
            />
          </Card>

          <div className="flex w-full flex-col gap-2">
            <Button
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => apply(stage.result)}
              data-testid={TEST_IDS.onboardingAccept}
            >
              Add this to my profile
              <ArrowRight className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => setStage({ name: "choose" })}
              data-testid={TEST_IDS.onboardingReject}
            >
              Try a different file
            </Button>
          </div>

          <SkipButton
            onClick={skip}
            disabled={busy}
            pending={leaving}
            label="Start from scratch instead"
          />
        </FadeIn>
      ) : null}

      {stage.name === "applying" ? (
        <FadeIn className="flex w-full flex-col items-center gap-8">
          <Heading
            title="Building your profile"
            description="One moment — we're saving everything we read."
          />
          <ResumeScan kind="building" />
        </FadeIn>
      ) : null}
    </div>
  );
}

function Heading({
  title,
  description,
}: {
  title: React.ReactNode;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {/* Manrope, not `font-display`: this is in-product, and Instrument Serif is
          the marketing voice (doc 08). Larger than a `PageHeader` because this
          screen has one job and no chrome competing with it. */}
      <h1 className="text-2xl text-foreground md:text-3xl">{title}</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted">
        {description}
      </p>
    </div>
  );
}

function OptionHeader({
  icon,
  title,
  description,
  recommended = false,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  recommended?: boolean;
  badge?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-warm text-muted"
        aria-hidden
      >
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          {recommended ? (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-brand">
              Fastest
            </span>
          ) : null}
          {badge ? (
            <span className="rounded-full bg-muted/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="text-xs leading-relaxed text-muted">{description}</p>
      </div>
    </div>
  );
}

/**
 * The escape hatch, present in every state (see the header). One component so
 * the three copies cannot drift into three different promises.
 *
 * **`disabled` and `pending` are two different facts and must stay separate.**
 * `disabled` means *something* is running — during a scan that is the scan, and
 * this button is greyed because the screen only does one thing at a time.
 * `pending` means **this button's own** action is running, and it is the only
 * thing that earns the spinner. Collapsing them into one prop puts a spinner on
 * Skip while a résumé is being read, which claims the skip is in progress and is
 * the exact confusion the disabled state exists to prevent.
 */
function SkipButton({
  onClick,
  disabled,
  pending,
  label = "Skip for now",
}: {
  onClick: () => void;
  disabled: boolean;
  pending: boolean;
  label?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      data-testid={TEST_IDS.onboardingSkip}
    >
      {pending ? <Spinner /> : null}
      {label}
    </Button>
  );
}
