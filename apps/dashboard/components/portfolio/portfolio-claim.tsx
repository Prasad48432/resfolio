"use client";

import { Button, Card, cn, Input, Label } from "@resfolio/ui";
import { Check, Globe, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  checkSlugAvailabilityAction,
  createPortfolioSiteAction,
} from "@/app/(dashboard)/portfolio/actions";
import { Page } from "@/components/layout/page";
import { PageHeader } from "@/components/layout/page-header";
import { TEST_IDS, portfolioTemplateTestId } from "@/lib/testids";

/**
 * The first-run portfolio screen (docs/architecture/03-portfolio-rendering.md):
 * claim a public slug and pick a template. The slug is checked live against the
 * domain's rules + the reserved blocklist + uniqueness; creating the site
 * navigates into the settings editor. Content isn't touched here — a site is
 * `Profile × template + config`.
 */
type SlugState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok" }
  | { status: "invalid"; reason: string }
  | { status: "taken" };

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  /** Gallery thumbnail (the template's own asset, or the placeholder). */
  preview: string;
}

export function PortfolioClaim({
  templates,
  suggestedSlug,
}: {
  templates: TemplateOption[];
  suggestedSlug: string;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(suggestedSlug);
  const [slugState, setSlugState] = useState<SlugState>({ status: "idle" });
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkSlug = useCallback(async (value: string) => {
    if (!value) {
      setSlugState({ status: "idle" });
      return;
    }
    setSlugState({ status: "checking" });
    try {
      const result = await checkSlugAvailabilityAction({ slug: value });
      if (!result.ok) {
        setSlugState({ status: "invalid", reason: "Try another name" });
        return;
      }
      if (!result.data.valid) {
        setSlugState({
          status: "invalid",
          reason: result.data.reason ?? "Not a valid name",
        });
      } else if (!result.data.available) {
        setSlugState({ status: "taken" });
      } else {
        setSlugState({ status: "ok" });
      }
    } catch {
      setSlugState({ status: "idle" });
    }
  }, []);

  // Debounced live availability check as the user types.
  useEffect(() => {
    const timer = setTimeout(() => void checkSlug(slug), 400);
    return () => clearTimeout(timer);
  }, [slug, checkSlug]);

  async function create() {
    setError(null);
    setCreating(true);
    try {
      const result = await createPortfolioSiteAction({ slug, templateId });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
        setCreating(false);
      }
    } catch {
      setError("Couldn't create your site. Please try again.");
      setCreating(false);
    }
  }

  const canCreate =
    slugState.status === "ok" && Boolean(templateId) && !creating;

  return (
    <Page data-testid={TEST_IDS.portfolioClaim}>
      <PageHeader
        title="Claim your site"
        description="Your portfolio renders from the same profile — pick a name and a template, then publish to a public URL."
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="portfolio-slug">Site address</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">resfolio.me/p/</span>
          <div className="relative flex-1">
            <Input
              id="portfolio-slug"
              value={slug}
              spellCheck={false}
              autoCapitalize="none"
              onChange={(event) =>
                setSlug(event.target.value.toLowerCase().trim())
              }
              className="pr-9 font-mono"
              data-testid={TEST_IDS.portfolioSlugInput}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <SlugIndicator state={slugState} />
            </span>
          </div>
        </div>
        <SlugMessage state={slugState} />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-foreground">
          Template
        </legend>
        {/* A gallery, not a list: you choose a template by looking at it. The
            radio stays as the real control (keyboard, form semantics) and is
            visually hidden — a card that only *looked* selectable would lose
            arrow-key navigation and the accessible group. */}
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          data-testid={TEST_IDS.portfolioTemplatePick}
        >
          {templates.map((template) => {
            const selected = templateId === template.id;
            return (
              <Card
                asChild
                key={template.id}
                className={cn(
                  "overflow-hidden p-0 transition-[border-color] duration-(--duration-press) ease-out",
                  selected
                    ? "border-brand/60 ring-1 ring-brand/40"
                    : "hover:border-brand/30",
                )}
                data-testid={portfolioTemplateTestId(template.id)}
              >
                <label className="flex cursor-pointer flex-col">
                  <input
                    type="radio"
                    name="template"
                    value={template.id}
                    checked={selected}
                    onChange={() => setTemplateId(template.id)}
                    className="sr-only"
                  />
                  <span className="relative block aspect-16/10 overflow-hidden border-b border-border bg-surface-warm">
                    {/* eslint-disable-next-line @next/next/no-img-element --
                        a template-owned asset path, not a known-host URL. */}
                    <img
                      src={template.preview}
                      alt=""
                      className="size-full object-cover object-top"
                    />
                    {selected ? (
                      <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-brand text-white">
                        <Check className="size-3" aria-hidden />
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-col gap-1 p-3">
                    <span className="text-sm font-medium text-foreground">
                      {template.name}
                    </span>
                    <span className="text-xs leading-relaxed text-muted">
                      {template.description}
                    </span>
                  </span>
                </label>
              </Card>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          disabled={!canCreate}
          onClick={() => void create()}
          data-testid={TEST_IDS.portfolioCreateButton}
        >
          {creating ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Globe aria-hidden />
          )}
          Create site
        </Button>
        {error ? (
          <span className="text-xs text-brand" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </Page>
  );
}

function SlugIndicator({ state }: { state: SlugState }) {
  if (state.status === "checking") {
    return <Loader2 className="size-4 animate-spin text-muted" aria-hidden />;
  }
  if (state.status === "ok") {
    return <Check className="size-4 text-brand" aria-hidden />;
  }
  if (state.status === "taken" || state.status === "invalid") {
    return <X className="size-4 text-brand" aria-hidden />;
  }
  return null;
}

function SlugMessage({ state }: { state: SlugState }) {
  const text =
    state.status === "taken"
      ? "That name is taken — try another."
      : state.status === "invalid"
        ? state.reason
        : state.status === "ok"
          ? "Available"
          : "";
  if (!text) {
    return null;
  }
  return (
    <span
      className={`text-xs ${state.status === "ok" ? "text-muted" : "text-brand"}`}
      role="status"
      data-testid={TEST_IDS.portfolioSlugStatus}
      data-status={state.status}
    >
      {text}
    </span>
  );
}
