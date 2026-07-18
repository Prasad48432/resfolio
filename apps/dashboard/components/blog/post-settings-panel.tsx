"use client";

import { formatReadingTime } from "@resfolio/blog";
import { Button, Input, Label, Textarea, cn } from "@resfolio/ui";
import { ChevronDown, Trash2 } from "lucide-react";
import { useState } from "react";

/**
 * Everything about a post that is not the writing.
 *
 * Collapsed by default, and that is the whole design decision: slug, excerpt
 * and SEO fields are each touched roughly once per post, while the body is
 * touched constantly. A form that shows all of them at once makes the screen
 * look like an admin panel — which is the specific thing this editor is meant
 * not to feel like. They are one click away, not gone.
 */
export function PostSettingsPanel({
  slug,
  slugError,
  slugLocked,
  excerpt,
  seoTitle,
  seoDescription,
  title,
  publishedAt,
  updatedAt,
  readingMinutes,
  onChange,
  onDelete,
}: {
  slug: string;
  slugError: string | null;
  /** True once published — the slug stops following the title (see the editor). */
  slugLocked: boolean;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  title: string;
  publishedAt: Date | null;
  updatedAt: Date;
  readingMinutes: number;
  onChange: (changes: {
    slug?: string;
    excerpt?: string;
    seoTitle?: string;
    seoDescription?: string;
  }) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-16 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-sm text-muted transition-colors duration-150 hover:text-foreground"
      >
        <ChevronDown
          className={cn(
            "size-4 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
        Post settings
        <span className="ml-auto text-xs opacity-70">
          /{slug || "untitled"}
        </span>
      </button>

      {open ? (
        <div className="mt-6 grid gap-6 animate-in fade-in slide-in-from-top-1 duration-200">
          <Field
            label="Slug"
            hint={
              slugLocked
                ? "This post is published — changing the slug breaks existing links."
                : "Generated from the title until you publish."
            }
            error={slugError}
          >
            <Input
              value={slug}
              onChange={(event) => onChange({ slug: event.target.value })}
              aria-invalid={Boolean(slugError)}
              spellCheck={false}
            />
          </Field>

          <Field
            label="Excerpt"
            hint="Shown in listings and used as the SEO description when one isn't set. Left empty, it's taken from your opening lines."
          >
            <Textarea
              value={excerpt}
              onChange={(event) => onChange({ excerpt: event.target.value })}
              rows={3}
              maxLength={400}
            />
          </Field>

          <div className="grid gap-6 border-t border-border pt-6">
            <p className="label-section">Search engines</p>
            <Field
              label="SEO title"
              hint={`Defaults to "${title || "Untitled"}".`}
            >
              <Input
                value={seoTitle}
                onChange={(event) => onChange({ seoTitle: event.target.value })}
                placeholder={title || "Untitled"}
                maxLength={70}
              />
            </Field>
            <Field label="SEO description" hint="Defaults to the excerpt.">
              <Textarea
                value={seoDescription}
                onChange={(event) =>
                  onChange({ seoDescription: event.target.value })
                }
                placeholder={excerpt}
                rows={2}
                maxLength={200}
              />
            </Field>
          </div>

          <dl className="grid gap-2 border-t border-border pt-6 text-xs text-muted">
            <Meta
              label="Reading time"
              value={formatReadingTime(readingMinutes)}
            />
            <Meta
              label="Published"
              value={
                publishedAt ? formatDate(publishedAt) : "Not yet published"
              }
            />
            <Meta label="Last updated" value={formatDate(updatedAt)} />
          </dl>

          <div className="border-t border-border pt-6">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-danger hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="size-4" />
              Delete post
            </Button>
            <p className="mt-2 text-xs text-muted">
              Permanent. Images used only by this post are deleted from storage
              too.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
