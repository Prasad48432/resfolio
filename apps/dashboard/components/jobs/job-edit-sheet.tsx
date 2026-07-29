"use client";

import { JOB_STATUSES, type JobStatus } from "@resfolio/job";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@resfolio/ui";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  deleteJobAction,
  moveJobAction,
  updateJobAction,
} from "@/app/(dashboard)/jobs/actions";
import { STATUS_LABELS, type JobCardView } from "@/lib/jobs";
import { TEST_IDS } from "@/lib/testids";

/**
 * Editing one card.
 *
 * **A `Sheet`, not a dialog.** The board is the context — you are correcting a
 * card while looking at the column it sits in — and a modal centred over six
 * columns hides the thing being edited. It is also where a job's link lives,
 * which is a field people come here specifically to paste.
 *
 * **Status is saved by its own action, not with the rest of the form.** Moving a
 * job records history in the domain (`setJobStatus`), and folding it into the
 * details update would either duplicate that recording or quietly skip it — at
 * which point the flow view stops matching the board for every job moved from
 * here rather than by dragging. Two writes, because they are two different
 * kinds of change.
 *
 * There is no score field and there never should be. A match percentage is a
 * result of reading a posting against a profile; a tracker that lets you type
 * one is a tracker whose numbers mean nothing.
 */
export function JobEditSheet({
  job,
  onClose,
  onSaved,
  onDeleted,
}: {
  /** The card being edited, or null when the sheet is closed. */
  job: JobCardView | null;
  onClose: () => void;
  onSaved: (job: JobCardView) => void;
  onDeleted: (jobId: string) => void;
}) {
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [status, setStatus] = useState<JobStatus>("saved");
  const [saving, setSaving] = useState(false);

  // Seeded whenever a different card opens, from the real stored fields — not
  // from `title`, which is derived from `role` and ellipsised past 80
  // characters. Reconstructing a role out of the title would write the
  // truncation back the first time someone fixed a typo on a long one.
  useEffect(() => {
    if (!job) {
      return;
    }
    setRole(job.role ?? "");
    setCompany(job.company ?? "");
    setLocation(job.location ?? "");
    setJobUrl(job.jobUrl ?? "");
    setStatus(job.status);
  }, [job]);

  async function save() {
    if (!job) {
      return;
    }
    setSaving(true);
    try {
      if (status !== job.status) {
        const moved = await moveJobAction({ jobId: job.id, status });
        if (!moved.ok) {
          toast.error("Couldn't move that job", { description: moved.error });
          return;
        }
      }

      // Every field, including the empty ones: the form was seeded from the
      // stored values, so a field the user cleared genuinely means "clear it".
      // The domain's merge rule (absent = leave alone, present = write) is what
      // makes that distinction available at all.
      const result = await updateJobAction({
        jobId: job.id,
        role,
        company,
        location,
        jobUrl,
      });
      if (!result.ok) {
        toast.error("Couldn't save that", { description: result.error });
        return;
      }

      onSaved({ ...result.data.job, status });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!job) {
      return;
    }
    setSaving(true);
    try {
      const result = await deleteJobAction({ jobId: job.id });
      if (!result.ok) {
        toast.error("Couldn't delete that job", { description: result.error });
        return;
      }
      onDeleted(job.id);
      onClose();
      toast.success("Job deleted");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={job !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-96 max-w-[90vw] flex-col gap-4 overflow-y-auto p-4"
        data-testid={TEST_IDS.jobEdit}
      >
        <SheetHeader className="p-0">
          <SheetTitle>Edit job</SheetTitle>
          <SheetDescription>
            Correct what the posting said. The match score and the analysis stay
            as they were read.
          </SheetDescription>
        </SheetHeader>

        <Field label="Role" testId={TEST_IDS.jobEditRole}>
          <Input
            id={TEST_IDS.jobEditRole}
            value={role}
            onChange={(event) => setRole(event.target.value)}
            data-testid={TEST_IDS.jobEditRole}
          />
        </Field>

        <Field label="Company" testId={TEST_IDS.jobEditCompany}>
          <Input
            id={TEST_IDS.jobEditCompany}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            data-testid={TEST_IDS.jobEditCompany}
          />
        </Field>

        <Field label="Location" testId={TEST_IDS.jobEditLocation}>
          <Input
            id={TEST_IDS.jobEditLocation}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Remote, London, …"
            data-testid={TEST_IDS.jobEditLocation}
          />
        </Field>

        <Field label="Posting link" testId={TEST_IDS.jobEditUrl}>
          <Input
            id={TEST_IDS.jobEditUrl}
            value={jobUrl}
            onChange={(event) => setJobUrl(event.target.value)}
            placeholder="https://…"
            data-testid={TEST_IDS.jobEditUrl}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <Label>Status</Label>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as JobStatus)}
          >
            <SelectTrigger data-testid={TEST_IDS.jobEditStatus}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOB_STATUSES.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {STATUS_LABELS[entry]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {job?.jobUrl ? (
          <Link
            href={job.jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit text-xs text-muted underline underline-offset-3"
          >
            Open the posting
          </Link>
        ) : null}

        <SheetFooter className="mt-auto flex-row gap-2 p-0">
          <Button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            data-testid={TEST_IDS.jobEditSave}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          {/* No confirmation, following the chat rail's rule: this destroys one
              row the user is pointing at and can see. Clearing everything would
              be the case that earns a dialog. */}
          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-muted"
            disabled={saving}
            onClick={() => void remove()}
            data-testid={TEST_IDS.jobEditDelete}
          >
            <Trash2 className="size-4" aria-hidden />
            Delete
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={testId}>{label}</Label>
      {children}
    </div>
  );
}
