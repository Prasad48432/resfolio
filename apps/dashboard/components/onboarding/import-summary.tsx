"use client";

import type { IntakeSectionKey, ResumeImportResult } from "@resfolio/profile";
import { Card } from "@resfolio/ui";
import { AlertCircle, Check } from "lucide-react";

import { Stagger, StaggerItem } from "@/components/motion/motion";
import { TEST_IDS } from "@/lib/testids";

/**
 * What the import found, before it is written
 * (docs/architecture/16-onboarding.md).
 *
 * **This screen exists because the import replaces everything.** Doc 13's spine
 * is propose → review → apply, and onboarding is not an exception to it: the
 * extraction is a model reading a document, so the user gets to see what it
 * understood before their profile becomes it. One click, and the escape hatch is
 * the point — an extraction that went wrong is caught here rather than discovered
 * later in an editor full of someone else's phrasing.
 *
 * **Every number comes from the built Profile, not from the extraction.** That is
 * `ResumeImportResult.counts`, computed by the domain from the object that will
 * actually be stored (`intake.ts`), so this panel cannot promise a fifth role that
 * the section schema refused. `dropped` is shown for the same reason: it is the
 * only place the user can learn that the document had more in it than this.
 *
 * Skills are counted in **terms** rather than groups, which is a domain decision —
 * see `buildProfileFromResume`.
 */

/** Singular and plural, because "1 roles" is the detail that makes a screen feel
 * unfinished. Ordered as the review reads, not as `SECTION_KEYS` does: experience
 * first because it is what a resume is mostly made of. */
const SECTION_LABELS: Record<IntakeSectionKey, [string, string]> = {
  experience: ["role", "roles"],
  education: ["qualification", "qualifications"],
  projects: ["project", "projects"],
  skills: ["skill", "skills"],
  writing: ["publication", "publications"],
  certifications: ["certification", "certifications"],
  awards: ["award", "awards"],
  languages: ["language", "languages"],
};

const ORDER: readonly IntakeSectionKey[] = [
  "experience",
  "education",
  "projects",
  "skills",
  "certifications",
  "writing",
  "awards",
  "languages",
];

function label(key: IntakeSectionKey, count: number): string {
  const [singular, plural] = SECTION_LABELS[key];
  return `${count} ${count === 1 ? singular : plural}`;
}

export function ImportSummary({
  result,
  name,
}: {
  result: Pick<ResumeImportResult, "counts" | "dropped" | "hasSummary">;
  /** The name the import read off the document, so the user can see at a glance
   * that it read the right document. */
  name: string;
}) {
  // Only what was found. A row saying "0 awards" is not information, it is a
  // checklist of things the user does not have, on the screen that is supposed to
  // make them feel set up.
  const found = ORDER.filter((key) => result.counts[key] > 0);

  return (
    <div
      className="flex w-full flex-col gap-4"
      data-testid={TEST_IDS.onboardingSummary}
    >
      {name ? (
        <div className="flex flex-col gap-0.5">
          <span className="label-section">Read from your resume</span>
          <p className="text-lg text-foreground">{name}</p>
        </div>
      ) : null}

      <Stagger className="flex flex-col gap-2">
        {result.hasSummary ? (
          <StaggerItem>
            <SummaryRow>Your summary</SummaryRow>
          </StaggerItem>
        ) : null}
        {found.map((key) => (
          <StaggerItem key={key}>
            <SummaryRow>{label(key, result.counts[key])}</SummaryRow>
          </StaggerItem>
        ))}
      </Stagger>

      {result.dropped > 0 ? (
        // Stated plainly rather than hidden. The user is about to look at their
        // profile, and "we couldn't read 2 entries" is the sentence that turns a
        // gap they would have blamed on us into one they can go and fix.
        <Card className="flex flex-row items-start gap-2.5 p-3">
          <AlertCircle
            className="mt-0.5 size-4 shrink-0 text-muted"
            aria-hidden
          />
          <p className="text-xs leading-relaxed text-muted">
            {result.dropped === 1
              ? "One entry couldn't be read and was left out."
              : `${result.dropped} entries couldn't be read and were left out.`}{" "}
            You can add them by hand in the editor.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function SummaryRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-foreground">
      <Check className="size-4 shrink-0 text-brand" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
