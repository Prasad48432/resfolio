"use client";

import type { Profile, ViewDefinition } from "@resfolio/profile";
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
  Switch,
} from "@resfolio/ui";
import { ArrowLeft, ExternalLink, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  deleteResumeAction,
  mintResumePrintUrlAction,
  updateResumeAction,
} from "@/app/(dashboard)/resumes/actions";
import { Page } from "@/components/layout/page";
import { FadeIn } from "@/components/motion/motion";
import { SaveIndicator } from "@/components/status/save-indicator";
import { SplitWorkspace } from "@/components/workspace/split-workspace";
import type { SaveStatus } from "@/lib/save-status";
import { TEST_IDS } from "@/lib/testids";

import { ResumePreview } from "./resume-preview";

/**
 * The resume document editor island (docs/architecture/08-dashboard-ux.md).
 * Left: a config form over the template's own schema (page size, margins,
 * accent, icons). Right: the live `ResumePreview`, updated optimistically as
 * you type. Debounced autosave persists the document via a Server Action; the
 * profile content is edited at `/profile` — a resume only presents it.
 *
 * Save state uses the shared `SaveStatus` vocabulary and `SaveIndicator`; this
 * editor simply never reaches the profile-only `invalid`/`conflict` states.
 */
const DEBOUNCE_MS = 700;

export function ResumeEditor({
  documentId,
  initialName,
  initialConfig,
  profile,
  view,
  printEnabled,
}: {
  documentId: string;
  initialName: string;
  initialConfig: ResumeClassicConfig;
  profile: Profile;
  view: ViewDefinition;
  printEnabled: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [config, setConfig] = useState(initialConfig);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const firstRender = useRef(true);

  // Latest values for saves triggered outside the debounce (mod+s).
  const latest = useRef({ name, config });
  latest.current = { name, config };

  const save = useCallback(async () => {
    setStatus("saving");
    try {
      const result = await updateResumeAction({
        id: documentId,
        name: latest.current.name,
        config: latest.current.config,
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
  }, [name, config, save]);

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
        printEnabled={printEnabled}
        onDeleted={() => router.push("/resumes")}
      />

      <FadeIn>
        <SplitWorkspace
          form={<ConfigForm config={config} onChange={updateConfig} />}
          preview={
            <ResumePreview profile={profile} config={config} view={view} />
          }
        />
      </FadeIn>
    </Page>
  );
}

function Header({
  name,
  onName,
  status,
  documentId,
  printEnabled,
  onDeleted,
}: {
  name: string;
  onName: (value: string) => void;
  status: SaveStatus;
  documentId: string;
  printEnabled: boolean;
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
          <SaveIndicator status={status} testId={TEST_IDS.resumeSaveIndicator} />
          {printEnabled ? <PrintLink documentId={documentId} /> : null}
          <DeleteButton documentId={documentId} onDeleted={onDeleted} />
        </div>
      </div>
    </div>
  );
}

function PrintLink({ documentId }: { documentId: string }) {
  const [loading, setLoading] = useState(false);

  async function openPrint() {
    setLoading(true);
    try {
      const result = await mintResumePrintUrlAction({ id: documentId });
      if (result.ok) {
        window.open(result.data.url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={loading}
      onClick={() => void openPrint()}
      data-testid={TEST_IDS.resumePrintLink}
    >
      {loading ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <ExternalLink aria-hidden />
      )}
      Print view
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
        onDeleted();
      } else {
        setDeleting(false);
      }
    } catch {
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
      {deleting ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <Trash2 aria-hidden />
      )}
    </Button>
  );
}

// The config schema's own enums (kept in sync via the ResumeClassicConfig type
// — a new option would fail to typecheck the `labels` records below).
const PAGE_SIZES = ["A4", "LETTER"] as const;
const MARGINS = ["compact", "normal", "relaxed"] as const;

function ConfigForm({
  config,
  onChange,
}: {
  config: ResumeClassicConfig;
  onChange: <K extends keyof ResumeClassicConfig>(
    key: K,
    value: ResumeClassicConfig[K],
  ) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="label-eyebrow">Layout</p>
        <p className="text-sm text-muted">
          Presentation only — your content lives in your{" "}
          <Link href="/profile" className="text-accent hover:underline">
            profile
          </Link>
          .
        </p>
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
          onChange={(event) => onChange("showIcons", event.target.checked)}
          data-testid={TEST_IDS.resumeShowIcons}
        />
      </label>
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
