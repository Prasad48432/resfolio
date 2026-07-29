"use client";

import {
  ENHANCE_CONFIRM_THRESHOLD,
  needsEnhanceConfirmation,
} from "@resfolio/job";
import type { ProfileChange, TailorReview } from "@resfolio/profile";
import {
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@resfolio/ui";
import { Check, FileText, Sparkles, TriangleAlert, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  applyJobEnhancementAction,
  enhanceProfileForJobAction,
  setJobResumeAction,
} from "@/app/(dashboard)/ai/job-actions";
import { tailorResumeAction } from "@/app/(dashboard)/ai/tailor-actions";
import type { ProposalOutput } from "@/lib/ai/tools";
import { TEST_IDS } from "@/lib/testids";

import { MatrixSpinner } from "../status/matrix-loader";
import { WorkingText } from "../status/working-text";
import { ProfileProposal } from "./profile-proposal";
import { TailorReviewPanel, type TailorTarget } from "./resume-tailor";
import { SkillGaps } from "./skill-gaps";

/**
 * One optimisation, one question: **where should it land?**
 * (docs/architecture/13-ai-layer.md, Phases 5 + 7, unified 2026-07-28.)
 *
 * ## What this replaced, and why it was wrong
 *
 * There used to be two buttons for one job. "Enhance profile for this job" sat on
 * the match card in the chat; "Tailor for this job" sat in the artefact panel
 * beside the resume. They were **never the same action** — enhancement rewrites
 * the Profile permanently and is therefore written conservatively (the wording has
 * to still read correctly for the next posting), while tailoring writes overrides
 * on one document and is therefore allowed to be pointed, because the canonical
 * record survives untouched. That distinction is real and worth keeping.
 *
 * Nothing on screen said any of it. So the honest reading of the UI was "press
 * this, then press this other one that appears to do the same thing again", and
 * a user who pressed both paid for two model calls that rewrote the same
 * sentences twice — the second on top of the first, which is exactly how a resume
 * ends up carrying two postings' worth of overrides and reading for neither.
 *
 * **The fix is not to merge the two capabilities, it is to merge the two
 * decisions.** They were always one decision the product had never asked: is this
 * a permanent improvement to how I describe my career, or a pointed version of it
 * for this one application? Asked once, up front, it costs one model call and
 * there is nothing left to press twice.
 *
 * ## Three things about the shape
 *
 * - **The destination decides everything, including ordering.** Section and item
 *   order is a property of a *resume*, not of a Profile — there is nowhere in a
 *   Profile to record "for this posting, lead with Projects" — so it comes with
 *   the resume branch and the profile branch has no equivalent. That is a
 *   constraint of the data model rather than a scope cut; the resume's own
 *   Sections panel owns ordering the rest of the time.
 * - **The `<70%` confirmation is on the profile branch only.** The rule
 *   (`@resfolio/job`) is about rewriting a *career record* to chase a role it does
 *   not fit. Pointing one document at a long shot is an ordinary thing to do with
 *   a document, and it is undone by one Reset.
 * - **Neither branch relaxes the guard.** Both go through
 *   `reviewProfileChanges`, both render per-change consent, and both write only
 *   through a Server Action the user triggered. The destination changes where the
 *   accepted value is stored, never what may be proposed.
 *
 * ## Optimising is done once, and then the card is finished (2026-07-29)
 *
 * **The strongest version of "already done" is that there is nothing left to
 * press.** The card used to retire branches one at a time — profile spent, this
 * resume spent — which is defensible and was still read as the product having
 * forgotten, because a reopened conversation showed a live button next to work
 * the user had already accepted. So once a posting has caused accepted profile
 * changes, the whole card closes: both destinations disabled and labelled, no
 * submit, one line saying what happened.
 *
 * The cost is real and worth naming: a resume can no longer be tailored for a job
 * after the profile has been enhanced for it, from this card. That is the
 * product's call — the alternative kept a live "This resume only" beside a
 * finished job, which is the thing being fixed. `/resumes/[id]` still owns
 * everything about a document, and a new chat can still tailor for the same
 * posting.
 *
 * **What stays live is the part that spends nothing**: `SkillGaps` below, where
 * the proposer is the user and the evidence is their own writing. It is a step of
 * the job session rather than an optimisation, and locking it would leave the
 * terms a posting names unlisted for the sake of a rule about model calls.
 *
 * ## Saying so is half the feature (2026-07-28)
 *
 * The first version withdrew the profile branch once a posting had been enhanced
 * for, and said so — but only in the sentence that replaced the button, and only
 * while the profile tile happened to be selected. Since the same flag also flips
 * the default destination to the resume, the tile explaining itself was never the
 * one on screen. A user reopening the conversation got a card with a live button,
 * no trace of the work they had already accepted, and a second model call one
 * click away.
 *
 * So **state belongs on the option, not in the space where a button used to be.**
 * Each tile now carries its own verdict, visible whichever one is selected, and
 * the header states the overall position in one line. The rule underneath has not
 * changed — a spent branch is withdrawn, a live one is offered — it is simply
 * legible now.
 *
 * The resume half needed a fact that did not exist: **which** resume this posting
 * had been pointed at. Applying tailoring now records it on the job
 * (`setJobResumeAction`), which is also how the artefact panel learns which
 * resume this application sends.
 */

type Destination = "profile" | "resume";

export function OptimiseForJob({
  jobId,
  jobDescription,
  score,
  resumes,
  alreadyEnhanced,
  tailoredResumeId,
  onApplied,
}: {
  jobId: string;
  jobDescription: string;
  /** The match percentage, for the confirmation threshold. */
  score: number;
  /** The user's resumes, four fields each — see `TailorTarget`. */
  resumes: TailorTarget[];
  /** This posting has already caused accepted profile changes, in this session or
   * an earlier one. Only the profile branch is withdrawn: a resume can be pointed
   * at the same posting afterwards and that is not a repeat of anything. */
  alreadyEnhanced: boolean;
  /**
   * The resume this posting has already been optimised for, if any.
   *
   * **Not a boolean, because the question is per-document.** "This job has a
   * resume" would retire the whole branch the first time one was tailored, and
   * pointing a *second* resume at the same posting is a real thing to do —
   * a short version, or one in another template. So the tile retires for the
   * resume that is spent and stays live for every other.
   */
  tailoredResumeId: string | null;
  onApplied?: () => void;
}) {
  const router = useRouter();

  const [destination, setDestination] = useState<Destination>(
    // Defaults to the permanent one, and to the resume only when the profile
    // branch has nothing left to do. The default should be the answer that is
    // right for someone who has not thought about the question.
    alreadyEnhanced && resumes.length > 0 ? "resume" : "profile",
  );
  const [resumeId, setResumeId] = useState(
    // Land on a resume there is still work to do on. Opening on the one already
    // tailored for this posting shows a dead branch as the default answer.
    resumes.find((entry) => entry.id !== tailoredResumeId)?.id ??
      resumes[0]?.id ??
      "",
  );
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const [proposal, setProposal] = useState<ProposalOutput | null>(null);
  const [tailored, setTailored] = useState<TailorReview | null>(null);
  const [tailoredName, setTailoredName] = useState("");
  const [applied, setApplied] = useState(false);
  /** Resumes optimised for this posting *during this session*, on top of the one
   * the server knew about. Covers the moment between applying and the job list
   * refreshing, which is exactly when the button would otherwise still be live. */
  const [tailoredHere, setTailoredHere] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** Bumped whenever something lands on the profile or the document, so the
   * demonstrated-skills list re-reads rather than offering what it just wrote. */
  const [applyCount, setApplyCount] = useState(0);

  const resume = resumes.find((entry) => entry.id === resumeId);
  const target = destination === "resume" ? resume : undefined;

  const isResumeSpent = (id: string): boolean =>
    id === tailoredResumeId || tailoredHere.has(id);

  /**
   * **This posting has been optimised for, and the card is finished.**
   *
   * One flag, not one per branch. Any accepted optimisation closes the whole
   * card — see the header. `applied` and `tailoredHere` cover the moment between
   * a click and the job list catching up; `alreadyEnhanced` and
   * `tailoredResumeId` cover every visit after that.
   */
  const done =
    alreadyEnhanced ||
    applied ||
    tailoredResumeId !== null ||
    tailoredHere.size > 0;

  const ready =
    !pending &&
    !done &&
    (destination === "profile" || target !== undefined) &&
    jobDescription.trim().length > 0;

  function clearResult() {
    setProposal(null);
    setTailored(null);
    setFailed(null);
  }

  async function run() {
    setConfirming(false);
    setPending(true);
    clearResult();
    try {
      if (destination === "profile") {
        const result = await enhanceProfileForJobAction({
          jobId,
          jobDescription,
        });
        if (!result.ok) {
          setFailed(result.error);
          return;
        }
        setProposal(result.data.review);
        return;
      }

      if (!target) {
        return;
      }
      const result = await tailorResumeAction({
        documentId: target.id,
        jobDescription,
      });
      if (!result.ok) {
        setFailed(result.error);
        return;
      }
      setTailored(result.data.review);
      setTailoredName(result.data.resumeName);
    } catch {
      setFailed("That didn't go through. Nothing was changed — try again.");
    } finally {
      setPending(false);
    }
  }

  function submit() {
    // Only the permanent branch asks. See the header.
    if (destination === "profile" && needsEnhanceConfirmation(score)) {
      setConfirming(true);
      return;
    }
    void run();
  }

  function choose(next: Destination) {
    if (next === destination) {
      return;
    }
    setDestination(next);
    // A review belongs to the destination that produced it. Leaving one on screen
    // under a freshly-switched toggle is a diff claiming to write somewhere it
    // will not.
    clearResult();
  }

  return (
    <div className="flex flex-col gap-3" data-testid={TEST_IDS.optimisePanel}>
      <Card className="flex flex-col gap-3 p-3">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-medium">
            <Sparkles className="size-4 text-muted" aria-hidden />
            Optimise for this job
          </p>
          {/* Two sentences for one card, and which one shows is the whole fix.
              The description explains an offer; once there is no offer left it
              describes work the user has already done, which is how a finished
              card ended up reading as an unfinished one. */}
          {done ? (
            <p
              className="text-xs text-muted"
              data-testid={TEST_IDS.optimiseDone}
            >
              Optimised for this posting — nothing further to run here. Ask
              “recalculate the match” for a fresh read of your profile as it now
              stands.
            </p>
          ) : (
            <p className="text-xs text-muted">
              Rewrites what&apos;s already in your profile so the relevant work
              leads. It never adds experience you don&apos;t have, and nothing is
              saved until you accept each change.
            </p>
          )}
        </div>

        {/* The question, asked once. Two cards rather than a select: the
            difference between them is the consequence, and a consequence needs a
            sentence — a dropdown gives it four words. */}
        <div
          className="grid gap-2 sm:grid-cols-2"
          role="radiogroup"
          aria-label="Where these changes should land"
          data-testid={TEST_IDS.optimiseDestination}
        >
          {/* Both tiles are disabled once the card is done. They stay on screen
              rather than being removed, because what happened to this posting is
              the most useful thing here afterwards — but neither is a control any
              more, and `aria-disabled` is what says so to a screen reader while
              keeping the text reachable. */}
          <DestinationOption
            icon={User}
            title="My profile"
            detail="Permanent. Every resume and your public page. Written to still read well for the next job."
            // The state that used to be invisible. A tile that says "done" is
            // readable whichever tile is selected; a sentence where the button
            // was is only readable from inside the branch it describes.
            done={
              alreadyEnhanced || applied
                ? { text: "Already enhanced for this job", positive: true }
                : done
                  ? { text: "Not used for this job", positive: false }
                  : null
            }
            selected={destination === "profile"}
            disabled={pending}
            locked={done}
            onSelect={() => choose("profile")}
            testId={TEST_IDS.optimiseToProfile}
          />
          <DestinationOption
            icon={FileText}
            title="This resume only"
            detail="Overrides on one document, plus its section order. Your profile keeps its wording, so this can be as pointed as the posting deserves."
            done={(() => {
              // Named, because with three resumes "already optimised" without
              // saying which one is a fact about nothing the user can see.
              const spentResume = resumes.find((entry) =>
                isResumeSpent(entry.id),
              );
              if (spentResume) {
                return {
                  text: `${spentResume.name} is already optimised for this job`,
                  positive: true,
                };
              }
              return done
                ? { text: "Not used for this job", positive: false }
                : null;
            })()}
            selected={destination === "resume"}
            disabled={pending || resumes.length === 0}
            locked={done}
            onSelect={() => choose("resume")}
            testId={TEST_IDS.optimiseToResume}
          />
        </div>

        {/* The picker is part of the offer, so it goes with it. Leaving a live
            dropdown under two disabled tiles is the same mixed message the whole
            change is removing. */}
        {done ? null : destination === "resume" ? (
          resumes.length === 0 ? (
            <p className="text-xs text-muted">
              You don&apos;t have a resume yet.{" "}
              <Link href="/resumes" className="text-brand hover:underline">
                Create one
              </Link>{" "}
              — it&apos;s a template plus your profile, and it takes a click.
            </p>
          ) : resumes.length > 1 ? (
            <Select
              value={resumeId}
              onValueChange={setResumeId}
              disabled={pending}
            >
              <SelectTrigger
                aria-label="Resume to optimise"
                data-testid={TEST_IDS.optimiseResumePick}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resumes.map((entry) => (
                  // Still selectable when spent — the user may want to read what
                  // was applied, and a disabled row in a list of three is a
                  // resume that looks broken rather than finished.
                  <SelectItem key={entry.id} value={entry.id}>
                    {isResumeSpent(entry.id) ? `${entry.name} ✓` : entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null
        ) : null}

        {/* Documents have no draft/publish split, so this is not a caveat about a
            later step — it is what happens on the click. */}
        {target?.isPublic ? (
          <p
            className="text-xs text-muted"
            data-testid={TEST_IDS.tailorPublicNotice}
          >
            {target.name} is public. Anything you apply shows at its link
            straight away.
          </p>
        ) : null}

        {done ? (
          // No button at all. The header sentence above already says what
          // happened and what to do next; this is the badge that makes the state
          // assertable and gives the row a shape where the control used to be.
          <p
            className="flex w-fit items-center gap-1.5 rounded-md bg-live/10 px-2 py-1 text-xs text-live"
            data-testid={TEST_IDS.jobMatchEnhanced}
          >
            <Check className="size-3.5 shrink-0" aria-hidden />
            Already optimised
          </p>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-fit"
            disabled={!ready}
            onClick={submit}
            data-testid={TEST_IDS.optimiseSubmit}
          >
            <Sparkles className="size-3.5" aria-hidden />
            {pending ? "Working…" : "Optimise for this job"}
          </Button>
        )}

        {failed ? (
          <p
            className="text-xs text-destructive"
            data-testid={TEST_IDS.jobMatchEnhanceError}
          >
            {failed}
          </p>
        ) : null}
      </Card>

      {confirming ? (
        // Inline rather than a modal: this is a question about the card it sits
        // under, and a dialog would cover the score it is asking about. One of
        // the few places where the quieter answer is the recommended one, so
        // Cancel leads.
        <Card
          className="flex flex-col gap-3 border-brand/40 p-3"
          data-testid={TEST_IDS.jobMatchConfirm}
        >
          <div className="flex items-start gap-2">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-brand"
              aria-hidden
            />
            <p className="text-[13px]">
              This job currently matches less than {ENHANCE_CONFIRM_THRESHOLD}%
              of your profile. Are you sure you want to change your profile for
              this role?
            </p>
          </div>
          <p className="text-xs text-muted">
            This edits your real profile, not a copy — and it can only re-word
            what&apos;s already there, so a gap the posting cares about will
            still be a gap afterwards. Choosing “This resume only” above keeps
            your profile as it is.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setConfirming(false)}
              data-testid={TEST_IDS.jobMatchConfirmCancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void run()}
              data-testid={TEST_IDS.jobMatchConfirmContinue}
            >
              Continue anyway
            </Button>
          </div>
        </Card>
      ) : null}

      {pending ? (
        <Card className="flex items-center gap-2 p-3 text-[13px] text-muted">
          <MatrixSpinner />
          {/* Two banks, not one line with the destination interpolated: which
              of the two this is _is_ the decision the card just asked for, so
              it leads the status rather than trailing it. */}
          <WorkingText
            kind={destination === "profile" ? "enhancing" : "tailoring"}
            detail={destination === "resume" ? target?.name : undefined}
          />
        </Card>
      ) : null}

      {proposal ? (
        <ProfileProposal
          review={proposal}
          // Same consent, same guard, same diff — the only difference is that
          // this write also records what the posting caused against the job.
          apply={async ({ changes }: { changes: ProfileChange[] }) => {
            const result = await applyJobEnhancementAction({ jobId, changes });
            if (result.ok) {
              setApplied(true);
              setApplyCount((current) => current + 1);
              onApplied?.();
            }
            return result;
          }}
        />
      ) : null}

      {/* Terms the posting names that the profile proves and never lists. Under
          the optimise card because it answers the same question — "make this
          resume say what my career says" — and it inherits the same destination,
          so the choice is still asked exactly once. It renders nothing when
          there is nothing to offer, which is the common case.

          `refreshToken` is `applyCount`: listing a skill or applying a rewrite
          changes the profile, and a candidate that has just been listed must
          drop off the list rather than being offered a second time. */}
      <SkillGaps
        jobId={jobId}
        // **Falls back to the profile once the card is finished**, because the
        // destination tiles are locked by then and inheriting a frozen choice
        // would leave this step pointing wherever the default happened to land.
        // The profile is also the right answer on its own terms: a term you have
        // demonstrably used is a fact about your career, not an opinion held by
        // one document, and listing it there makes every future resume print it.
        destination={done ? "profile" : destination}
        {...(!done && target ? { documentId: target.id } : {})}
        refreshToken={applyCount}
      />

      {tailored && target ? (
        <TailorReviewPanel
          documentId={target.id}
          resumeName={tailoredName}
          review={tailored}
          onApplied={() => {
            // Record which resume this application sends. Without it nothing
            // anywhere knows this posting and this document have met: the card
            // offers the same tailoring again on the next visit, and the artefact
            // panel's resume picker sits empty beside a resume written for this
            // exact job. `setJobResumeAction` existed for this and had no caller.
            void setJobResumeAction({ jobId, documentId: target.id });
            setTailoredHere((current) => new Set(current).add(target.id));
            // The resume's override count changed, and it is rendered by the
            // server (`TailorTarget.tailoredFields`). A refresh is right here and
            // wrong for the profile branch, which has its own in-place state.
            router.refresh();
            setApplyCount((current) => current + 1);
            onApplied?.();
          }}
        />
      ) : null}
    </div>
  );
}

function DestinationOption({
  icon: Icon,
  title,
  detail,
  done,
  selected,
  disabled,
  locked,
  onSelect,
  testId,
}: {
  icon: typeof User;
  title: string;
  detail: string;
  /** What has already happened down this path, or null while it is still on
   * offer. Replaces `detail`: describing an offer that no longer exists is what
   * made a finished card read as an unfinished one. `positive` separates "this
   * is what you did" from "this one wasn't used" — both are records, and only
   * one of them is an accomplishment. */
  done: { text: string; positive: boolean } | null;
  selected: boolean;
  disabled: boolean;
  /** The card is finished, so this is a record rather than a control. */
  locked: boolean;
  onSelect: () => void;
  testId: string;
}) {
  return (
    // **`aria-disabled` when locked, not `disabled`.** A `disabled` button is
    // removed from the tab order, which would put the explanation of what
    // happened to this job somewhere a keyboard or screen-reader user cannot
    // reach — and the text is the entire remaining purpose of the tile. The
    // click is inert either way.
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={locked || undefined}
      disabled={disabled && !locked}
      onClick={locked ? undefined : onSelect}
      data-testid={testId}
      className={`flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors duration-(--duration-fast) ease-out disabled:opacity-50 ${
        locked
          ? "cursor-default border-border opacity-70"
          : selected
            ? "border-brand/50 bg-brand/5"
            : "border-border hover:bg-surface-warm"
      }`}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-medium">
        <Icon className="size-3.5 shrink-0 text-muted" aria-hidden />
        {title}
      </span>
      {done ? (
        // `text-live`, the token the product already uses for "this is done and
        // it worked" — not a colour picked for this card.
        <span
          className={`flex items-center gap-1.5 text-xs ${
            done.positive ? "text-live" : "text-muted"
          }`}
        >
          {done.positive ? (
            <Check className="size-3.5 shrink-0" aria-hidden />
          ) : null}
          {done.text}
        </span>
      ) : (
        <span className="text-xs text-muted">{detail}</span>
      )}
    </button>
  );
}
