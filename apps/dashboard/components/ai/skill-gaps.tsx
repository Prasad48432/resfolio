"use client";

import type { DemonstratedSkill } from "@resfolio/profile";
import {
  Button,
  Card,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@resfolio/ui";
import { ListPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  listDemonstratedSkillsAction,
  listSkillsForJobAction,
} from "@/app/(dashboard)/ai/job-actions";
import { skillGapTestId, TEST_IDS } from "@/lib/testids";

/**
 * Terms the posting wants that the profile **proves but never lists**
 * (docs/architecture/13-ai-layer.md).
 *
 * ## The gap this closes
 *
 * The analysis says Docker is covered — and it is, because the profile mentions
 * Docker in a project's `technologies` and in an experience bullet. The Skills
 * section says nothing about Docker. So the resume prints a Skills block without
 * it, an ATS keyword-scanning that block does not find it, and the user reads
 * "Docker ✓" beside a resume that does not say Docker. Both statements were true;
 * together they were useless.
 *
 * Nothing else in the AI layer could fix it. The proposal guard forbids a
 * set-valued field from gaining a member and **must**, because the thing proposing
 * is a model. What this screen changes is not the rule but *who is asking*: the
 * candidates are computed from the user's own writing, each one shows the entries
 * it was found in, and the user ticks a box. `@resfolio/profile`'s
 * `addDemonstratedSkills` then re-derives the evidence server-side and refuses
 * anything the profile does not already contain — so this is a new **surface**,
 * not a new permission.
 *
 * ## What it will not offer
 *
 * A term the profile never mentions. OWASP in a posting the user has no security
 * work for is a genuine gap and stays one; it appears in the keyword row above,
 * unticked and untickable, which is the honest place for it. That is the whole
 * distinction the user's own instruction drew — "only if supported by existing
 * experience" — enforced in the domain rather than asked of a model.
 *
 * ## The destination is inherited, not asked again
 *
 * It comes from `OptimiseForJob`'s one question. **Profile** lists the skill
 * canonically, so every future resume prints it. **This resume only** writes a
 * `deltas` entry on that document's view, so the Skills block on that one PDF
 * gains the term and the Profile keeps exactly the words the user wrote.
 */
export function SkillGaps({
  jobId,
  destination,
  documentId,
  refreshToken = 0,
}: {
  jobId: string;
  destination: "profile" | "resume";
  /** Required for the resume destination — where the delta lands. */
  documentId?: string;
  /** Bumped by the parent when the profile may have changed underneath this, so
   * a listed skill drops off the list rather than being offered twice. */
  refreshToken?: number;
}) {
  const [candidates, setCandidates] = useState<DemonstratedSkill[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listed, setListed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void listDemonstratedSkillsAction({ jobId })
      .then((result) => {
        if (cancelled || !result.ok) {
          return;
        }
        setCandidates(result.data.skills);
        setGroups(result.data.groups);
        // Nothing is pre-ticked. These are additions to somebody's career
        // record; the default has to be "no", and a pre-ticked list is how a
        // "review" screen becomes a confirmation screen.
        setChosen({});
        setListed(false);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, refreshToken]);

  const selected = candidates
    .filter((candidate) => chosen[candidate.skill] !== undefined)
    .map((candidate) => ({
      skill: candidate.skill,
      groupId: chosen[candidate.skill] as string,
    }));

  async function apply() {
    if (selected.length === 0) {
      return;
    }
    setSaving(true);
    try {
      const result = await listSkillsForJobAction({
        jobId,
        destination,
        ...(documentId ? { documentId } : {}),
        additions: selected,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setListed(true);
      toast.success(
        destination === "profile"
          ? `Listed in your profile · ${selected.length}`
          : `Listed on this resume · ${selected.length}`,
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return null;
  }

  // Nothing to offer is the common, healthy case — a profile whose Skills
  // section already says what the rest of it says. Rendering an empty card
  // would be a permanent piece of furniture reporting that nothing is wrong.
  if (candidates.length === 0) {
    return null;
  }

  if (groups.length === 0) {
    return (
      <Card
        className="p-3 text-xs text-muted"
        data-testid={TEST_IDS.skillGapsPanel}
      >
        This posting names {candidates.length}{" "}
        {candidates.length === 1 ? "skill" : "skills"} your profile demonstrates
        but doesn&apos;t list — and you have no skill groups to put{" "}
        {candidates.length === 1 ? "it" : "them"} in.{" "}
        <Link href="/profile" className="text-brand hover:underline">
          Add one
        </Link>{" "}
        and come back.
      </Card>
    );
  }

  return (
    <Card
      className="flex flex-col gap-3 p-3"
      data-testid={TEST_IDS.skillGapsPanel}
    >
      <div>
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <ListPlus className="size-4 text-muted" aria-hidden />
          Skills you&apos;ve used but haven&apos;t listed
        </p>
        {/* **Every gap between an expression and the next word is an explicit
            `{" "}`.** Written as a literal space after `}` it rendered as
            "1 termthat" and "print itand" — the space sat at the start of a text
            node that JSX then trimmed, which is invisible in the source and
            plain in the product. */}
        <p className="text-xs text-muted">
          This posting names {candidates.length}{" "}
          {candidates.length === 1 ? "term" : "terms"}{" "}
          {candidates.length === 1 ? "that appears" : "that appear"} in your work
          below but not in your Skills section — so a resume doesn&apos;t print{" "}
          {candidates.length === 1 ? "it" : "them"} and a keyword scan
          doesn&apos;t find {candidates.length === 1 ? "it" : "them"}. Nothing
          here is a new claim; tick what you want listed.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {candidates.map((candidate) => {
          const picked = chosen[candidate.skill];
          return (
            <div
              key={candidate.skill}
              className="flex flex-wrap items-start gap-2"
              data-testid={skillGapTestId(candidate.skill)}
            >
              <Checkbox
                id={`skill-${candidate.skill}`}
                className="mt-0.5"
                checked={picked !== undefined}
                disabled={saving || listed}
                onCheckedChange={(next) =>
                  setChosen((current) => {
                    const copy = { ...current };
                    if (next === true) {
                      copy[candidate.skill] =
                        candidate.suggestedGroupId ?? groups[0]!.id;
                    } else {
                      delete copy[candidate.skill];
                    }
                    return copy;
                  })
                }
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label
                  htmlFor={`skill-${candidate.skill}`}
                  className="text-[13px] wrap-anywhere"
                >
                  {candidate.skill}
                </label>
                {/* The evidence, always shown. A tick beside a bare term is a
                    claim the user is asked to trust; a tick beside "Brainground,
                    Revival Labs" is a decision about something they wrote. */}
                {candidate.evidence.length > 0 ? (
                  <p className="text-xs text-muted wrap-anywhere">
                    Already in{" "}
                    {candidate.evidence.map((ref) => ref.label).join(" · ")}
                  </p>
                ) : null}
              </div>

              {picked !== undefined && groups.length > 1 ? (
                <Select
                  value={picked}
                  onValueChange={(value) =>
                    setChosen((current) => ({
                      ...current,
                      [candidate.skill]: value,
                    }))
                  }
                  disabled={saving || listed}
                >
                  <SelectTrigger className="max-w-40 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          );
        })}
      </div>

      {listed ? (
        <p className="text-xs text-muted" data-testid={TEST_IDS.skillGapsDone}>
          {destination === "profile"
            ? "Listed in your profile draft. Publish from the profile editor when you're ready."
            : "Listed on this resume only. Your profile is unchanged."}
        </p>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="w-fit"
          disabled={selected.length === 0 || saving}
          onClick={() => void apply()}
          data-testid={TEST_IDS.skillGapsApply}
        >
          {saving ? <Spinner size="sm" /> : null}
          {destination === "profile"
            ? `List in my profile${selected.length > 0 ? ` · ${selected.length}` : ""}`
            : `List on this resume${selected.length > 0 ? ` · ${selected.length}` : ""}`}
        </Button>
      )}
    </Card>
  );
}
