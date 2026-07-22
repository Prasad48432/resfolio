"use client";

import {
  Button,
  Card,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@resfolio/ui";
import { ExternalLink, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { claimHandleAction } from "@/app/(dashboard)/handle/actions";
import { setPublicResumeAction } from "@/app/(dashboard)/resumes/actions";
import {
  HandleField,
  type HandleState,
} from "@/components/handle/handle-field";
import { TEST_IDS } from "@/lib/testids";

/**
 * The "Public resume" card on `/resumes` (docs/architecture/02-resume-rendering.md).
 * Two jobs, both driven by the shared profile **handle**:
 *
 * - **Claim the username** — this is the second entry point for it (the
 *   portfolio section is the other). A first-time user can get a public resume
 *   URL without ever touching `/portfolio`.
 * - **Pick which resume** renders at `/r/<handle>`. With a single resume the
 *   route auto-uses it, so the picker only becomes load-bearing at two or more;
 *   the copy says which is happening.
 *
 * Selecting/claiming refreshes the route so the server re-reads the pinned
 * pointer — this card never holds authoritative state.
 */
export function PublicResumeCard({
  handle,
  publicBaseUrl,
  publicResumeId,
  resumes,
}: {
  handle: string | null;
  publicBaseUrl: string;
  publicResumeId: string | null;
  resumes: { id: string; name: string }[];
}) {
  return (
    <Card
      className="flex flex-col gap-4 p-4"
      data-testid={TEST_IDS.publicResumeCard}
    >
      <div className="flex flex-col gap-1">
        <p className="label-section">Public resume</p>
        <p className="text-sm text-muted">
          Share one resume at a friendly URL. Your username is shared with your
          portfolio.
        </p>
      </div>

      {handle ? (
        <ClaimedBody
          handle={handle}
          publicBaseUrl={publicBaseUrl}
          publicResumeId={publicResumeId}
          resumes={resumes}
        />
      ) : (
        <ClaimForm />
      )}
    </Card>
  );
}

/** Before a username exists: the shared handle input + a claim button. */
function ClaimForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [state, setState] = useState<HandleState>({ status: "idle" });
  const [claiming, setClaiming] = useState(false);

  async function claim() {
    setClaiming(true);
    try {
      const result = await claimHandleAction({ handle: value });
      if (result.ok) {
        toast.success("Username claimed.");
        router.refresh();
      } else {
        toast.error(result.error);
        setClaiming(false);
      }
    } catch {
      toast.error("Couldn't claim that username. Please try again.");
      setClaiming(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="resume-handle">Your username</Label>
        <HandleField
          id="resume-handle"
          value={value}
          onValueChange={setValue}
          onStateChange={setState}
          prefix="resfolio.me/r/"
          inputTestId={TEST_IDS.handleInput}
          statusTestId={TEST_IDS.handleStatus}
        />
      </div>
      <Button
        type="button"
        size="sm"
        className="self-start"
        disabled={state.status !== "ok" || claiming}
        onClick={() => void claim()}
        data-testid={TEST_IDS.handleClaimButton}
      >
        {claiming ? <Spinner size="sm" /> : <Globe aria-hidden />}
        Claim username
      </Button>
    </div>
  );
}

/** After a username exists: the public URL + the which-resume picker. */
function ClaimedBody({
  handle,
  publicBaseUrl,
  publicResumeId,
  resumes,
}: {
  handle: string;
  publicBaseUrl: string;
  publicResumeId: string | null;
  resumes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const publicUrl = `${publicBaseUrl}/r/${handle}`;

  // With one resume the route auto-uses it; the picker reflects that as the
  // current value while making clear no explicit choice is required.
  const soleResumeId = resumes.length === 1 ? resumes[0]!.id : null;
  const effective = publicResumeId ?? soleResumeId ?? "";
  const isAuto = publicResumeId === null && soleResumeId !== null;

  async function select(documentId: string) {
    setSaving(true);
    try {
      const result = await setPublicResumeAction({ documentId });
      if (result.ok) {
        toast.success("Public resume updated.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Couldn't update your public resume. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Public link</Label>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 break-all font-mono text-xs text-muted transition-colors duration-(--duration-fast) ease-out hover:text-brand"
          data-testid={TEST_IDS.publicResumeUrl}
        >
          {publicUrl}
          <ExternalLink className="size-3 shrink-0" aria-hidden />
        </a>
      </div>

      {resumes.length === 0 ? (
        <p className="text-xs text-muted">
          Create a resume below and it will be published here automatically.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="public-resume-select">Resume shown here</Label>
          <Select
            value={effective || undefined}
            disabled={saving}
            onValueChange={(next) => void select(next)}
          >
            <SelectTrigger
              id="public-resume-select"
              data-testid={TEST_IDS.publicResumeSelect}
            >
              <SelectValue placeholder="Choose a resume" />
            </SelectTrigger>
            <SelectContent>
              {resumes.map((resume) => (
                <SelectItem key={resume.id} value={resume.id}>
                  {resume.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted">
            {isAuto
              ? "Automatically using your only resume — create another to choose."
              : "Shows your published profile. Private resumes show a private notice."}
          </p>
        </div>
      )}
    </div>
  );
}
