"use client";

import {
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Switch,
} from "@resfolio/ui";
import { ExternalLink, Rocket, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  publishPortfolioSiteAction,
  updatePortfolioSiteAction,
} from "@/app/(dashboard)/portfolio/actions";
import { Page } from "@/components/layout/page";
import { FadeIn } from "@/components/motion/motion";
import { ConfigFields } from "@/components/portfolio/config-fields";
import { SaveIndicator } from "@/components/status/save-indicator";
import { SplitWorkspace } from "@/components/workspace/split-workspace";
import type { ConfigFieldDescriptor } from "@/lib/config-form";
import type { SaveStatus } from "@/lib/save-status";
import { TEST_IDS } from "@/lib/testids";

/**
 * The portfolio settings + publish editor (docs/architecture/03-portfolio-rendering.md,
 * 08-dashboard-ux.md). Left: the schema-driven config form + discoverable
 * toggle, debounced-autosaved. Right: the site card (public URL, publish state)
 * — the draft-preview iframe layers in here later. Publishing pins the
 * profile's published version and invalidates the public cache; editing config
 * never republishes (publish is one deliberate action, doc 04).
 *
 * Save state uses the shared `SaveStatus` vocabulary and `SaveIndicator`; this
 * editor simply never reaches the profile-only `invalid`/`conflict` states.
 *
 * **Requirements** (doc 05) are advisory: the template declares what it can't
 * look right without, and this surfaces it three ways — a dialog on arrival, a
 * standing checklist above the form, and a disabled Publish. The draft still
 * previews throughout, because a half-filled page is what the user fixes it
 * against.
 */
const DEBOUNCE_MS = 700;

export interface MissingRequirementView {
  key: string;
  label: string;
  /** Where the user fixes it — this form, or `/profile`. */
  where: "settings" | "profile";
}

export function PortfolioEditor({
  slug,
  templateId,
  templates,
  templateName,
  fields,
  initialConfig,
  initialMissing,
  discoverable: initialDiscoverable,
  publicBaseUrl,
  profilePublished,
  sitePublished,
  siteUpToDate,
}: {
  slug: string;
  templateId: string;
  templates: { id: string; name: string }[];
  templateName: string;
  fields: ConfigFieldDescriptor[];
  initialConfig: Record<string, unknown>;
  initialMissing: MissingRequirementView[];
  discoverable: boolean;
  publicBaseUrl: string;
  profilePublished: boolean;
  sitePublished: boolean;
  siteUpToDate: boolean;
}) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [discoverable, setDiscoverable] = useState(initialDiscoverable);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [switching, setSwitching] = useState(false);
  const firstRender = useRef(true);

  /**
   * Config gaps are recomputed here rather than trusted from the server, so
   * typing a cover URL clears the warning and re-enables Publish immediately —
   * a checklist that only updated on reload would be worse than none.
   *
   * Profile gaps keep the server's answer: they can't change without leaving
   * this page, and this component has no profile to check against.
   */
  const missing = useMemo(() => {
    const configMissing = fields
      .filter(
        (field) => field.required && !String(config[field.key] ?? "").trim(),
      )
      .map((field) => ({
        key: field.key,
        label: field.label,
        where: "settings" as const,
      }));
    const profileMissing = initialMissing.filter(
      (entry) => entry.where === "profile",
    );
    return [...configMissing, ...profileMissing];
  }, [fields, config, initialMissing]);

  const latest = useRef({ config, discoverable });
  latest.current = { config, discoverable };

  const save = useCallback(async () => {
    setStatus("saving");
    try {
      const result = await updatePortfolioSiteAction({
        config: latest.current.config,
        discoverable: latest.current.discoverable,
      });
      setStatus(result.ok ? "saved" : "offline");
    } catch {
      setStatus("offline");
    }
  }, []);

  // Switching templates resets config server-side; reload the editor so the
  // form reflects the new template's fields + defaults.
  async function switchTemplate(nextTemplateId: string) {
    if (nextTemplateId === templateId) {
      return;
    }
    setSwitching(true);
    try {
      const result = await updatePortfolioSiteAction({
        templateId: nextTemplateId,
      });
      if (result.ok) {
        router.refresh();
      } else {
        setSwitching(false);
      }
    } catch {
      setSwitching(false);
    }
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setStatus("dirty");
    const timer = setTimeout(() => void save(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [config, discoverable, save]);

  const publicUrl = `${publicBaseUrl}/p/${slug}`;

  return (
    <Page wide data-testid={TEST_IDS.portfolioEditor}>
      <SetupDialog
        templateName={templateName}
        missing={initialMissing}
        fields={fields}
        config={config}
        onChange={(key, value) =>
          setConfig((current) => ({ ...current, [key]: value }))
        }
      />
      <Header
        slug={slug}
        status={status}
        profilePublished={profilePublished}
        sitePublished={sitePublished}
        siteUpToDate={siteUpToDate}
        missing={missing}
      />

      <FadeIn>
        <SplitWorkspace
          form={
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <p className="label-section">{templateName}</p>
                <p className="text-[13px] leading-relaxed text-muted">
                  Presentation only — your content lives in your profile.
                </p>
              </div>

              {templates.length > 1 ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="portfolio-template">Template</Label>
                  <Select
                    value={templateId}
                    disabled={switching}
                    onValueChange={(value) => void switchTemplate(value)}
                  >
                    <SelectTrigger
                      id="portfolio-template"
                      data-testid={TEST_IDS.portfolioTemplatePick}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted">
                    Switching keeps your URL — only the design changes.
                  </p>
                </div>
              ) : null}

              <MissingChecklist missing={missing} />

              <ConfigFields
                fields={fields}
                config={config}
                onChange={(key, value) =>
                  setConfig((current) => ({ ...current, [key]: value }))
                }
              />

              <label className="flex items-center justify-between gap-4 border-t border-border pt-6 text-sm text-foreground">
                <span>
                  List my site publicly (allow search engines to index it)
                </span>
                <Switch
                  checked={discoverable}
                  onCheckedChange={setDiscoverable}
                  data-testid={TEST_IDS.portfolioDiscoverable}
                />
              </label>
            </div>
          }
          preview={<PreviewPlaceholder publicUrl={publicUrl} />}
        />
      </FadeIn>
    </Page>
  );
}

/**
 * The arrival prompt — **a form, not a notice.** A template declares what it
 * needs; this asks for exactly that and nothing else, right where the user
 * lands, so choosing a template and finishing it is one motion instead of a
 * scavenger hunt through a settings panel.
 *
 * Only the *config* gaps are editable here, because those are the fields this
 * page owns. Profile gaps ("at least one project") can't be filled from a
 * modal — they're real content, they live at `/profile`, and pretending
 * otherwise would mean building a second profile editor inside a dialog. They
 * are listed with a link instead.
 *
 * Opened once per mount from the **server's** list: it must not re-open as the
 * user types, so live progress belongs to the standing checklist. Dismissible,
 * with nothing gated behind it — the preview still renders and the user may
 * want to look around first.
 */
function SetupDialog({
  templateName,
  missing,
  fields,
  config,
  onChange,
}: {
  templateName: string;
  missing: MissingRequirementView[];
  fields: ConfigFieldDescriptor[];
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const [open, setOpen] = useState(missing.length > 0);
  if (missing.length === 0) {
    return null;
  }

  const askable = fields.filter((field) =>
    missing.some(
      (entry) => entry.where === "settings" && entry.key === field.key,
    ),
  );
  const profileGaps = missing.filter((entry) => entry.where === "profile");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto"
        data-testid={TEST_IDS.portfolioSetupDialog}
      >
        <DialogTitle>Finish setting up {templateName}</DialogTitle>
        <DialogDescription>
          This template needs a few things the rest don&apos;t. Fill them in
          here — everything autosaves, and you can close this and come back.
        </DialogDescription>

        {askable.length > 0 ? (
          <div className="my-4">
            <ConfigFields
              fields={askable}
              config={config}
              onChange={onChange}
            />
          </div>
        ) : null}

        {profileGaps.length > 0 ? (
          <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-surface-warm p-3">
            <p className="text-xs font-medium text-foreground">
              Also missing from your profile
            </p>
            <ul className="flex flex-col gap-1">
              {profileGaps.map((entry) => (
                <li key={entry.key} className="text-xs text-muted">
                  {entry.label}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">
              These are real content, so they live in your profile — not here.
            </p>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          {profileGaps.length > 0 ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/profile">Go to profile</Link>
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button size="sm">Done</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The standing checklist — updates live as the form is filled in. */
function MissingChecklist({ missing }: { missing: MissingRequirementView[] }) {
  if (missing.length === 0) {
    return null;
  }
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-brand/5 p-3"
      data-testid={TEST_IDS.portfolioMissingChecklist}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <TriangleAlert className="size-3.5 text-brand" aria-hidden />
        Needed before publishing
      </p>
      <ul className="flex flex-col gap-1">
        {missing.map((entry) => (
          <li key={entry.key} className="text-xs text-muted">
            {entry.label}
            {entry.where === "profile" ? (
              <>
                {" — "}
                <Link href="/profile" className="text-brand hover:underline">
                  add it in your profile
                </Link>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Header({
  slug,
  status,
  profilePublished,
  sitePublished,
  siteUpToDate,
  missing,
}: {
  slug: string;
  status: SaveStatus;
  profilePublished: boolean;
  sitePublished: boolean;
  siteUpToDate: boolean;
  missing: MissingRequirementView[];
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border pb-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-foreground">
          Portfolio
        </h2>
        {/* The URL is the page's subject, so it gets mono — the one place a
            typeface change carries meaning rather than decoration. */}
        <p className="truncate font-mono text-[13px] text-muted">
          resfolio.me/p/{slug}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <SaveIndicator
          status={status}
          testId={TEST_IDS.portfolioSaveIndicator}
        />
        <PublishButton
          profilePublished={profilePublished}
          sitePublished={sitePublished}
          siteUpToDate={siteUpToDate}
          missing={missing}
        />
      </div>
    </div>
  );
}

function PublishButton({
  profilePublished,
  sitePublished,
  siteUpToDate,
  missing,
}: {
  profilePublished: boolean;
  sitePublished: boolean;
  siteUpToDate: boolean;
  missing: MissingRequirementView[];
}) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function publish() {
    setError(null);
    setPublishing(true);
    try {
      const result = await publishPortfolioSiteAction({});
      if (result.ok) {
        setDone(true);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Couldn't publish. Please try again.");
    } finally {
      setPublishing(false);
    }
  }

  const label = !sitePublished
    ? "Publish site"
    : siteUpToDate && !done
      ? "Published"
      : "Publish changes";
  const upToDate = (siteUpToDate || done) && sitePublished;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span
          className="text-xs text-muted"
          data-testid={TEST_IDS.portfolioPublishState}
          data-published={sitePublished}
          data-uptodate={upToDate}
        >
          {upToDate
            ? "Live & up to date"
            : sitePublished
              ? "Update available"
              : "Not published"}
        </span>
        <Button
          type="button"
          size="sm"
          disabled={
            publishing || !profilePublished || upToDate || missing.length > 0
          }
          onClick={() => void publish()}
          data-testid={TEST_IDS.portfolioPublishButton}
        >
          {publishing ? <Spinner size="sm" /> : <Rocket aria-hidden />}
          {label}
        </Button>
      </div>
      {!profilePublished ? (
        <span className="text-xs text-brand" role="note">
          Publish your profile first
        </span>
      ) : missing.length > 0 ? (
        <span className="text-xs text-brand" role="note">
          {missing.length} thing{missing.length === 1 ? "" : "s"} still needed
        </span>
      ) : null}
      {error ? (
        <span className="text-xs text-brand" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The preview pane — **a placeholder, deliberately** (2026-07-18).
 *
 * This used to iframe `apps/sites/preview/portfolio`, re-minting a signed
 * token and re-rendering the entire portfolio application after every save.
 * That is a whole second render of a whole second app to answer "what does
 * this look like?", and the cost grows with every template we add — the wrong
 * shape to keep paying for while the template system is still moving.
 *
 * The **bar is unchanged on purpose**: "Draft preview" and "Open live site"
 * are the two things the user came here to do, and Open live site is a real
 * link to a real site. Only the pane between them is stubbed, so restoring a
 * real preview later is a swap of this one component's body.
 */
function PreviewPlaceholder({ publicUrl }: { publicUrl: string }) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="label-section">Draft preview</span>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted transition-colors duration-(--duration-fast) ease-out hover:text-brand"
          data-testid={TEST_IDS.portfolioPublicUrl}
        >
          Open live site
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-surface-warm p-8 text-center"
        data-testid={TEST_IDS.portfolioPreviewPlaceholder}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a static
            decorative asset, not a user image; next/image buys nothing here. */}
        <img
          src="/portfolio/preview-placeholder.svg"
          alt=""
          className="max-h-64 w-full max-w-md object-contain opacity-80"
        />
        <div className="flex flex-col gap-1.5">
          <p className="label-section">Preview coming soon</p>
          <p className="max-w-xs text-xs leading-relaxed text-muted">
            Your settings save as you type. Open the live site to see them — a
            faster in-place preview is on the way.
          </p>
        </div>
      </div>
    </Card>
  );
}
