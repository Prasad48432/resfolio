"use client";

import type { DocumentVisibility } from "@resfolio/document";
import {
  clearTailoring,
  countTailoredFields,
  type Profile,
  type ViewDefinition,
} from "@resfolio/profile";
import type { ResumeClassicConfig } from "@resfolio/template-resume-classic";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Switch,
} from "@resfolio/ui";
import { ArrowLeft, Download, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  deleteResumeAction,
  updateResumeAction,
} from "@/app/(dashboard)/resumes/actions";
import { Page } from "@/components/layout/page";
import { FadeIn } from "@/components/motion/motion";
import { SaveIndicator } from "@/components/status/save-indicator";
import { SplitWorkspace } from "@/components/workspace/split-workspace";
import { downloadFile } from "@/lib/download";
import type { SaveStatus } from "@/lib/save-status";
import { TEST_IDS } from "@/lib/testids";

import { ResumePreview } from "./resume-preview";
import { ResumeSections } from "./resume-sections";

/**
 * The resume document editor island (docs/architecture/08-dashboard-ux.md).
 *
 * Left: the configuration layer — **Sections** (what this resume shows, a
 * ViewDefinition), **Layout** (the template's own presentation schema), and
 * **Sharing** (public/private + the permanent URL). Right: the live
 * `ResumePreview`, updated optimistically as you type. Debounced autosave
 * persists the document via a Server Action.
 *
 * The line this editor holds: a resume **presents** a profile, it never
 * contains one. Nothing here edits content — that is `/profile`, and it is one
 * click away from every empty state.
 *
 * Save state uses the shared `SaveStatus` vocabulary and `SaveIndicator`; this
 * editor simply never reaches the profile-only `invalid`/`conflict` states.
 */
const DEBOUNCE_MS = 700;

export function ResumeEditor({
  documentId,
  templateId,
  initialName,
  initialConfig,
  initialView,
  initialVisibility,
  profile,
  publicUrl,
  exportEnabled,
}: {
  documentId: string;
  /** Which resume template this document renders (chosen at create time). */
  templateId: string;
  initialName: string;
  initialConfig: ResumeClassicConfig;
  initialView: ViewDefinition;
  initialVisibility: DocumentVisibility;
  profile: Profile;
  publicUrl: string | null;
  exportEnabled: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [config, setConfig] = useState(initialConfig);
  const [view, setView] = useState(initialView);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const firstRender = useRef(true);

  // Latest values for saves triggered outside the debounce (mod+s).
  const latest = useRef({ name, config, view, visibility });
  latest.current = { name, config, view, visibility };

  const save = useCallback(async () => {
    setStatus("saving");
    try {
      const result = await updateResumeAction({
        id: documentId,
        name: latest.current.name,
        config: latest.current.config,
        view: latest.current.view,
        visibility: latest.current.visibility,
      });
      setStatus(result.ok ? "saved" : "offline");
    } catch {
      setStatus("offline");
    }
  }, [documentId]);

  // Debounced autosave on any edit; skip the initial mount.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setStatus("dirty");
    const timer = setTimeout(() => void save(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [name, config, view, visibility, save]);

  // mod+s forces an immediate save (doc 08 keyboard-first standard).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "s" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void save();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [save]);

  function updateConfig<K extends keyof ResumeClassicConfig>(
    key: K,
    value: ResumeClassicConfig[K],
  ) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  return (
    <Page wide data-testid={TEST_IDS.resumeEditor}>
      <Header
        name={name}
        onName={setName}
        status={status}
        documentId={documentId}
        exportEnabled={exportEnabled}
        onDeleted={() => router.push("/resumes")}
      />

      <FadeIn>
        <SplitWorkspace
          form={
            <div className="flex flex-col gap-10">
              <TailoredNotice view={view} onReset={setView} />
              <ResumeSections
                profile={profile}
                view={view}
                onChange={setView}
              />
              <ConfigForm
                config={config}
                links={profile.basics.links}
                onChange={updateConfig}
              />
              <SharingForm
                visibility={visibility}
                onChange={setVisibility}
                publicUrl={publicUrl}
              />
            </div>
          }
          preview={
            <ResumePreview
              templateId={templateId}
              profile={profile}
              config={config}
              view={view}
            />
          }
        />
      </FadeIn>
    </Page>
  );
}

/**
 * "Some of this wording isn't your profile's" (doc 13, Phase 5).
 *
 * Job tailoring writes overrides into this document's `view`, so a user who
 * tailored at `/ai/job` and then opened this editor would otherwise see prose in
 * the preview that does not appear anywhere in their profile, with nothing on
 * screen to explain it and no way to undo it. That is the exact confusion the
 * "a resume presents a profile, it never contains one" rule exists to prevent, so
 * the deviation gets named where the document is edited.
 *
 * **Reset needs no Server Action.** This editor already owns `view` and autosaves
 * it, so dropping the overrides is a pure state change (`clearTailoring`) that the
 * existing save path persists — and the preview updates immediately, which is the
 * point of a reset.
 */
function TailoredNotice({
  view,
  onReset,
}: {
  view: ViewDefinition;
  onReset: (next: ViewDefinition) => void;
}) {
  const count = countTailoredFields(view);
  if (count === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border px-3 py-2 text-xs text-muted"
      data-testid={TEST_IDS.resumeTailoredNotice}
    >
      <Sparkles className="size-3.5 shrink-0" aria-hidden />
      <span>
        {count} {count === 1 ? "field is" : "fields are"} tailored for a job —
        this resume says something your profile doesn&apos;t.
      </span>
      <button
        type="button"
        onClick={() => onReset(clearTailoring(view))}
        className="underline underline-offset-3 transition-colors duration-(--duration-fast) ease-out hover:text-foreground"
        data-testid={TEST_IDS.resumeTailoredReset}
      >
        Use your profile&apos;s wording
      </button>
    </div>
  );
}

function Header({
  name,
  onName,
  status,
  documentId,
  exportEnabled,
  onDeleted,
}: {
  name: string;
  onName: (value: string) => void;
  status: SaveStatus;
  documentId: string;
  exportEnabled: boolean;
  onDeleted: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4">
      <Link
        href="/resumes"
        className="flex w-fit items-center gap-1.5 text-xs text-muted transition-colors duration-(--duration-fast) ease-out hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All resumes
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="resume-name" className="sr-only">
            Resume name
          </Label>
          {/* The title *is* the input — renaming shouldn't need a mode switch.
              It borrows PageHeader's type so the page reads as titled rather
              than as a form field pretending to be a heading, and reveals its
              editability with a border on hover. */}
          <Input
            id="resume-name"
            value={name}
            onChange={(event) => onName(event.target.value)}
            className="h-auto -mx-2 w-full border-transparent bg-transparent px-2 py-1 text-lg font-semibold tracking-[-0.01em] text-foreground hover:border-border"
            data-testid={TEST_IDS.resumeNameInput}
          />
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator
            status={status}
            testId={TEST_IDS.resumeSaveIndicator}
          />
          {exportEnabled ? (
            <DownloadPdfButton documentId={documentId} name={name} />
          ) : null}
          <DeleteButton documentId={documentId} onDeleted={onDeleted} />
        </div>
      </div>
    </div>
  );
}

/**
 * Fetch-then-save, not a plain `<a download>`.
 *
 * The anchor was cheaper and got the bytes, but it had no idea whether it
 * worked: a PDF takes seconds to render (Chromium boots), and the button gave
 * no sign it had been pressed — so people pressed it again, queuing a second
 * render. Worse, the route's failure modes (501 when the export env isn't
 * configured, 502 when the render host is down) answer with **JSON**, which
 * the browser cheerfully navigated to and displayed as raw text instead of an
 * error the user could understand.
 *
 * Fetching means the in-flight state is real, repeat clicks are impossible,
 * and a failure becomes a toast. The cost is buffering the file in memory
 * before saving it — fine for a resume, which is measured in hundreds of KB.
 *
 * Renders the current **draft**, matching the preview beside it (the public
 * URL shows the published version — see `SharingForm`).
 */
function DownloadPdfButton({
  documentId,
  name,
}: {
  documentId: string;
  name: string;
}) {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    const pending = toast.loading("Generating your PDF…", {
      description: "This takes a few seconds.",
    });
    try {
      // `lib/download.ts` — shared with the cover letter, which learned the same
      // lesson. It owns the fetch, the server-supplied filename, the object-URL
      // lifetime and the Safari revoke delay; what stays here is the copy, which
      // is the only part that differs between the two.
      const result = await downloadFile(
        `/api/resumes/${encodeURIComponent(documentId)}/pdf`,
        `${name || "resume"}.pdf`,
      );

      if (!result.ok) {
        toast.error("Couldn't generate the PDF", {
          id: pending,
          // The route sends `{ error }` for the cases it can explain (export not
          // configured, render host unreachable); anything else gets generic copy.
          description: result.error ?? "Please try again in a moment.",
        });
        return;
      }

      toast.success("PDF downloaded", {
        id: pending,
        description: "Check your downloads folder.",
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={downloading}
      onClick={() => void download()}
      data-testid={TEST_IDS.resumeDownloadPdf}
    >
      {downloading ? <Spinner size="sm" /> : <Download aria-hidden />}
      {downloading ? "Generating…" : "Download PDF"}
    </Button>
  );
}

function DeleteButton({
  documentId,
  onDeleted,
}: {
  documentId: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!window.confirm("Delete this resume? This can't be undone.")) {
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteResumeAction({ id: documentId });
      if (result.ok) {
        toast.success("Resume deleted");
        onDeleted();
      } else {
        toast.error("Couldn't delete this resume", {
          description: result.error,
        });
        setDeleting(false);
      }
    } catch {
      toast.error("Couldn't delete this resume", {
        description: "Please try again.",
      });
      setDeleting(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={deleting}
      onClick={() => void remove()}
      aria-label="Delete resume"
      data-testid={TEST_IDS.resumeDeleteButton}
    >
      {deleting ? <Spinner size="sm" /> : <Trash2 aria-hidden />}
    </Button>
  );
}

// The config schema's own enums (kept in sync via the ResumeClassicConfig type
// — a new option would fail to typecheck the `labels` records below).
const PAGE_SIZES = ["A4", "LETTER"] as const;
const MARGINS = ["compact", "normal", "relaxed"] as const;
const FONT_SIZES = ["medium", "small"] as const;

function ConfigForm({
  config,
  links,
  onChange,
}: {
  config: ResumeClassicConfig;
  links: Profile["basics"]["links"];
  onChange: <K extends keyof ResumeClassicConfig>(
    key: K,
    value: ResumeClassicConfig[K],
  ) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {/* `.label-section`, not `.label-eyebrow`: the accent-coloured,
            wide-tracked eyebrow is marketing's voice (doc 08). */}
        <p className="label-section">Layout</p>
        <p className="text-sm text-muted">How this resume looks on the page.</p>
      </div>

      <SelectField
        label="Page size"
        value={config.pageSize}
        options={PAGE_SIZES}
        labels={{ A4: "A4", LETTER: "US Letter" }}
        onChange={(value) => onChange("pageSize", value)}
        testId={TEST_IDS.resumePageSize}
      />

      <SelectField
        label="Font size"
        value={config.fontSize}
        options={FONT_SIZES}
        labels={{ medium: "Medium", small: "Small" }}
        onChange={(value) => onChange("fontSize", value)}
        testId={TEST_IDS.resumeFontSize}
      />

      <SelectField
        label="Margins"
        value={config.margin}
        options={MARGINS}
        labels={{ compact: "Compact", normal: "Normal", relaxed: "Relaxed" }}
        onChange={(value) => onChange("margin", value)}
        testId={TEST_IDS.resumeMargin}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="resume-accent">Accent color</Label>
        <div className="flex items-center gap-2">
          <input
            id="resume-accent"
            type="color"
            value={config.accent}
            onChange={(event) => onChange("accent", event.target.value)}
            className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1"
            data-testid={TEST_IDS.resumeAccent}
            aria-label="Accent color"
          />
          <Input
            value={config.accent}
            onChange={(event) => onChange("accent", event.target.value)}
            spellCheck={false}
            className="w-32 font-mono text-sm"
            aria-label="Accent hex value"
          />
        </div>
      </div>

      <label className="flex items-center justify-between gap-4 text-sm text-foreground">
        <span>Show contact icons</span>
        <Switch
          checked={config.showIcons}
          onCheckedChange={(checked) => onChange("showIcons", checked)}
          data-testid={TEST_IDS.resumeShowIcons}
        />
      </label>

      <LinkVisibility
        links={links}
        hiddenLinkIds={config.hiddenLinkIds}
        onChange={(next) => onChange("hiddenLinkIds", next)}
      />
    </div>
  );
}

/**
 * Which profile links appear under the name. Every link used to render
 * unconditionally, which is wrong for a resume specifically: a portfolio wants
 * every link you have, an application wants the two that matter to *this*
 * employer.
 *
 * The control is per-resume config, not a profile edit — the same links stay
 * on the portfolio, and two resumes can show different subsets. State is
 * stored as the **hidden** ids (see `hiddenLinkIds` in the template config for
 * why), so the switches read inverted here and nowhere else.
 */
function LinkVisibility({
  links,
  hiddenLinkIds,
  onChange,
}: {
  links: Profile["basics"]["links"];
  hiddenLinkIds: string[];
  onChange: (next: string[]) => void;
}) {
  if (links.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Profile links</Label>
        <p className="text-xs text-muted">
          No links yet — add them at{" "}
          <Link href="/profile" className="text-brand hover:underline">
            /profile
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Label>Profile links</Label>
      <p className="-mt-1 text-xs text-muted">
        Which links show under your name on this resume.
      </p>
      {links.map((link) => {
        const shown = !hiddenLinkIds.includes(link.id);
        return (
          <label
            key={link.id}
            className="flex items-center justify-between gap-4 text-sm text-foreground"
          >
            <span className="min-w-0 truncate">
              {link.label}
              <span className="ml-2 font-mono text-xs text-muted">
                {link.url.replace(/^https?:\/\//, "")}
              </span>
            </span>
            <Switch
              checked={shown}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? hiddenLinkIds.filter((id) => id !== link.id)
                    : [...hiddenLinkIds, link.id],
                )
              }
              data-testid={TEST_IDS.resumeLinkToggle(link.id)}
            />
          </label>
        );
      })}
    </div>
  );
}

/**
 * Sharing (doc 02). Two states, and the copy has to be honest about what each
 * one means — including the part people get wrong: the public URL shows the
 * **published** profile, so a resume can be public and still not reflect edits
 * you haven't published. The Download PDF button, by contrast, always renders
 * your draft. Saying so here is cheaper than a support thread.
 */
function SharingForm({
  visibility,
  onChange,
  publicUrl,
}: {
  visibility: DocumentVisibility;
  onChange: (value: DocumentVisibility) => void;
  publicUrl: string | null;
}) {
  const isPublic = visibility === "public";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="label-section">Sharing</p>
        <p className="text-sm text-muted">
          {isPublic
            ? "Anyone with the link can view this resume. It isn’t listed in search engines."
            : "Only you can view this resume."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="resume-visibility">Visibility</Label>
        <Select
          value={visibility}
          onValueChange={(next) => onChange(next as DocumentVisibility)}
        >
          <SelectTrigger
            id="resume-visibility"
            data-testid={TEST_IDS.resumeVisibility}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="private">Private</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPublic && publicUrl ? (
        <div className="flex flex-col gap-1.5">
          <Label>Public link</Label>
          {/* Mono because it's a URL — that's what mono means here (doc 08). */}
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all font-mono text-xs text-muted transition-colors duration-(--duration-fast) ease-out hover:text-brand"
            data-testid={TEST_IDS.resumePublicUrl}
          >
            {publicUrl}
          </a>
          <p className="text-xs text-muted">
            Shows your published profile. Publish at{" "}
            <Link href="/profile" className="text-brand hover:underline">
              /profile
            </Link>{" "}
            to update it.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`resume-${label}`}>{label}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={`resume-${label}`} data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labels[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
