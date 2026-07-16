"use client";

import { Button, Label, Select, Switch } from "@resfolio/ui";
import {
  Check,
  CloudOff,
  ExternalLink,
  Globe,
  Loader2,
  Rocket,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  mintPortfolioPreviewUrlAction,
  publishPortfolioSiteAction,
  updatePortfolioSiteAction,
} from "@/app/(dashboard)/portfolio/actions";
import { ConfigFields } from "@/components/portfolio/config-fields";
import { SplitWorkspace } from "@/components/workspace/split-workspace";
import type { ConfigFieldDescriptor } from "@/lib/config-form";
import { TEST_IDS } from "@/lib/testids";

/**
 * The portfolio settings + publish editor (docs/architecture/03-portfolio-rendering.md,
 * 08-dashboard-ux.md). Left: the schema-driven config form + discoverable
 * toggle, debounced-autosaved. Right: the site card (public URL, publish state)
 * — the draft-preview iframe layers in here later. Publishing pins the
 * profile's published version and invalidates the public cache; editing config
 * never republishes (publish is one deliberate action, doc 04).
 */
type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "offline";

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: "All changes saved",
  dirty: "Unsaved changes…",
  saving: "Saving…",
  saved: "Saved",
  offline: "Offline — will retry",
};

const DEBOUNCE_MS = 700;

export function PortfolioEditor({
  slug,
  templateId,
  templates,
  templateName,
  fields,
  initialConfig,
  discoverable: initialDiscoverable,
  publicBaseUrl,
  previewEnabled,
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
  discoverable: boolean;
  publicBaseUrl: string;
  previewEnabled: boolean;
  profilePublished: boolean;
  sitePublished: boolean;
  siteUpToDate: boolean;
}) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [discoverable, setDiscoverable] = useState(initialDiscoverable);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const firstRender = useRef(true);

  const latest = useRef({ config, discoverable });
  latest.current = { config, discoverable };

  // Mint (and re-mint) the draft-preview iframe URL — a fresh short-TTL token
  // each time, so the iframe reloads to the just-saved draft and never expires
  // mid-session.
  const refreshPreview = useCallback(async () => {
    if (!previewEnabled) {
      return;
    }
    try {
      const result = await mintPortfolioPreviewUrlAction({});
      if (result.ok) {
        setPreviewUrl(result.data.url);
      }
    } catch {
      // Leave the previous preview in place.
    }
  }, [previewEnabled]);

  const save = useCallback(async () => {
    setStatus("saving");
    try {
      const result = await updatePortfolioSiteAction({
        config: latest.current.config,
        discoverable: latest.current.discoverable,
      });
      setStatus(result.ok ? "saved" : "offline");
      if (result.ok) {
        void refreshPreview();
      }
    } catch {
      setStatus("offline");
    }
  }, [refreshPreview]);

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

  // Initial preview render on mount.
  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

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
    <div className="flex flex-col gap-6" data-testid={TEST_IDS.portfolioEditor}>
      <Header
        slug={slug}
        status={status}
        profilePublished={profilePublished}
        sitePublished={sitePublished}
        siteUpToDate={siteUpToDate}
      />

      <SplitWorkspace
        form={
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <p className="label-eyebrow">{templateName}</p>
              <p className="text-sm text-muted">
                Presentation only — your content lives in your profile.
              </p>
            </div>

            {templates.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="portfolio-template">Template</Label>
                <Select
                  id="portfolio-template"
                  value={templateId}
                  disabled={switching}
                  onChange={(event) => void switchTemplate(event.target.value)}
                  data-testid={TEST_IDS.portfolioTemplatePick}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted">
                  Switching keeps your URL — only the design changes.
                </p>
              </div>
            ) : null}

            <ConfigFields
              fields={fields}
              config={config}
              onChange={(key, value) =>
                setConfig((current) => ({ ...current, [key]: value }))
              }
            />

            <label className="flex items-center justify-between gap-4 border-t border-border pt-6 text-sm text-foreground">
              <span>List my site publicly (allow search engines to index it)</span>
              <Switch
                checked={discoverable}
                onChange={(event) => setDiscoverable(event.target.checked)}
                data-testid={TEST_IDS.portfolioDiscoverable}
              />
            </label>
          </div>
        }
        preview={
          previewEnabled && previewUrl ? (
            <PreviewFrame previewUrl={previewUrl} publicUrl={publicUrl} />
          ) : (
            <SiteCard
              publicUrl={publicUrl}
              sitePublished={sitePublished}
              discoverable={discoverable}
            />
          )
        }
      />
    </div>
  );
}

function Header({
  slug,
  status,
  profilePublished,
  sitePublished,
  siteUpToDate,
}: {
  slug: string;
  status: SaveStatus;
  profilePublished: boolean;
  sitePublished: boolean;
  siteUpToDate: boolean;
}) {
  const SaveIcon =
    status === "saving" ? Loader2 : status === "offline" ? CloudOff : Check;
  const tone = status === "offline" ? "text-accent" : "text-muted";

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="label-eyebrow">Portfolio</p>
          <h2 className="font-display text-3xl text-foreground">
            resfolio.me/p/{slug}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-1.5 text-xs ${tone}`}
            role="status"
            aria-live="polite"
            data-testid={TEST_IDS.portfolioSaveIndicator}
            data-status={status}
          >
            <SaveIcon
              className={`size-3.5 ${status === "saving" ? "animate-spin" : ""}`}
              aria-hidden
            />
            {SAVE_LABEL[status]}
          </span>
          <PublishButton
            profilePublished={profilePublished}
            sitePublished={sitePublished}
            siteUpToDate={siteUpToDate}
          />
        </div>
      </div>
    </div>
  );
}

function PublishButton({
  profilePublished,
  sitePublished,
  siteUpToDate,
}: {
  profilePublished: boolean;
  sitePublished: boolean;
  siteUpToDate: boolean;
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
          {upToDate ? "Live & up to date" : sitePublished ? "Update available" : "Not published"}
        </span>
        <Button
          type="button"
          size="sm"
          disabled={publishing || !profilePublished || upToDate}
          onClick={() => void publish()}
          data-testid={TEST_IDS.portfolioPublishButton}
        >
          {publishing ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Rocket aria-hidden />
          )}
          {label}
        </Button>
      </div>
      {!profilePublished ? (
        <span className="text-xs text-accent" role="note">
          Publish your profile first
        </span>
      ) : null}
      {error ? (
        <span className="text-xs text-accent" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function PreviewFrame({
  previewUrl,
  publicUrl,
}: {
  previewUrl: string;
  publicUrl: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-xs text-muted">Draft preview</span>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted hover:text-accent"
          data-testid={TEST_IDS.portfolioPublicUrl}
        >
          Open live site
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
      <iframe
        // A fresh token URL after each save reloads the iframe to the latest
        // draft — the real template, rendered by `apps/sites` (doc 08/09).
        key={previewUrl}
        src={previewUrl}
        title="Portfolio draft preview"
        className="min-h-0 w-full flex-1 bg-white"
        sandbox="allow-scripts allow-same-origin"
        data-testid={TEST_IDS.portfolioPreviewFrame}
      />
    </div>
  );
}

function SiteCard({
  publicUrl,
  sitePublished,
  discoverable,
}: {
  publicUrl: string;
  sitePublished: boolean;
  discoverable: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
      <Globe className="size-9 text-accent" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">Your site is at</p>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 font-mono text-sm text-foreground hover:text-accent"
          data-testid={TEST_IDS.portfolioPublicUrl}
        >
          {publicUrl.replace(/^https?:\/\//, "")}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
      <p className="max-w-xs text-xs leading-relaxed text-muted">
        {sitePublished
          ? discoverable
            ? "Live and indexable. Changes go live when you publish."
            : "Live but hidden from search engines (not discoverable)."
          : "Not published yet — publish to make this URL live."}
      </p>
    </div>
  );
}
