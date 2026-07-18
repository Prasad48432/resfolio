"use client";

import {
  blogSlugSchema,
  formatReadingTime,
  slugify,
  type BlogBody,
  type BlogPostRecord,
} from "@resfolio/blog";
import { Label, Switch, TagInput, Textarea, cn } from "@resfolio/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { SaveIndicator } from "@/components/status/save-indicator";
import type { SaveStatus } from "@/lib/save-status";

import { CoverImageField } from "./cover-image-field";
import { PostSettingsPanel } from "./post-settings-panel";
import { RichTextEditor } from "./rich-text-editor";
import {
  deletePostAction,
  updatePostAction,
} from "@/app/(dashboard)/blog/actions";

/**
 * The post editor.
 *
 * ## Layout
 *
 * One centred column, not a split workspace. The résumé and portfolio editors
 * split because their output is a *visual artefact* you need to see while you
 * configure it. A post's output is the text you are already looking at — a
 * preview pane would show the same words twice and halve the width of both.
 * Everything that is not the writing (slug, tags, SEO, cover) lives in a
 * collapsible panel, so the default state of this screen is a title and a page.
 *
 * ## Autosave
 *
 * Debounced, following the profile editor's convention (doc 08): edits are
 * never explicitly saved, and the indicator is the only feedback. Publishing is
 * the one deliberate action, because it is the one with a consequence.
 */

/** Long enough that a normal typing pause doesn't fire a request, short enough
 * that stepping away from the keyboard saves. Matches the profile editor. */
const AUTOSAVE_DELAY_MS = 900;

interface Draft {
  title: string;
  slug: string;
  excerpt: string;
  body: BlogBody;
  coverAssetKey: string | null;
  coverUrl: string | null;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
}

export function PostEditor({
  post,
  coverUrl,
  maxImages,
}: {
  post: BlogPostRecord;
  coverUrl: string | null;
  maxImages: number;
}) {
  const router = useRouter();

  const [draft, setDraft] = useState<Draft>(() => ({
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    body: post.body,
    coverAssetKey: post.coverAssetKey,
    coverUrl,
    tags: post.tags,
    seoTitle: post.seoTitle ?? "",
    seoDescription: post.seoDescription ?? "",
  }));

  const [status, setStatus] = useState<SaveStatus>("idle");
  const [published, setPublished] = useState(post.status === "published");
  const [publishedAt, setPublishedAt] = useState(post.publishedAt);
  const [readingTime, setReadingTime] = useState(post.readingMinutes);
  const [updatedAt, setUpdatedAt] = useState(post.updatedAt);
  const [publishing, setPublishing] = useState(false);

  // The body is held in a ref as well as in state: it changes on every
  // keystroke and only the autosave reads it, so re-rendering the whole editor
  // for it would throw away the very smoothness this screen is for.
  const bodyRef = useRef<BlogBody>(post.body);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a slow save landing after a newer one and reporting stale
  // derived values back into the UI.
  const saveSeq = useRef(0);

  const save = useCallback(
    async (
      patch: Record<string, unknown>,
      options: { silent?: boolean } = {},
    ) => {
      const seq = ++saveSeq.current;
      setStatus("saving");
      const result = await updatePostAction({ id: post.id, ...patch });

      if (seq !== saveSeq.current) {
        // A newer save is already in flight; its result is the current truth.
        return result;
      }

      if (!result.ok) {
        setStatus("offline");
        if (!options.silent) {
          toast.error(result.error);
        }
        return result;
      }

      // Reading time, excerpt and slug are all derived server-side; render the
      // authoritative values rather than the editor's guess at them.
      setReadingTime(result.data.readingMinutes);
      setUpdatedAt(new Date(result.data.updatedAt));
      setPublishedAt(
        result.data.publishedAt ? new Date(result.data.publishedAt) : null,
      );
      setDraft((previous) => ({
        ...previous,
        excerpt: previous.excerpt.trim()
          ? previous.excerpt
          : result.data.excerpt,
      }));
      setStatus("saved");
      return result;
    },
    [post.id],
  );

  /** Queue a debounced save of the current draft. */
  const queueSave = useCallback(
    (patch: Record<string, unknown>) => {
      setStatus("dirty");
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        void save({ ...patch, body: bodyRef.current });
      }, AUTOSAVE_DELAY_MS);
    },
    [save],
  );

  // Flush a pending save on unmount so navigating away mid-debounce does not
  // silently discard the last few seconds of writing.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const patchDraft = useCallback(
    (changes: Partial<Draft>) => {
      setDraft((previous) => {
        const next = { ...previous, ...changes };
        queueSave({
          title: next.title,
          slug: next.slug,
          excerpt: next.excerpt,
          coverAssetKey: next.coverAssetKey,
          tags: next.tags,
          seoTitle: next.seoTitle || null,
          seoDescription: next.seoDescription || null,
        });
        return next;
      });
    },
    [queueSave],
  );

  const onBodyChange = useCallback(
    (body: BlogBody) => {
      bodyRef.current = body;
      setStatus("dirty");
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        void save({ body });
      }, AUTOSAVE_DELAY_MS);
    },
    [save],
  );

  /**
   * The slug follows the title only while the post has never been published.
   *
   * Once a post is live its URL is a promise to anyone who linked to it, and
   * silently rewriting it because a typo was fixed in the title breaks those
   * links with no warning. Before publishing there is no such promise, and
   * having to hand-write a slug for every draft is friction for nothing.
   */
  const slugFollowsTitle = !publishedAt;

  const onTitleChange = useCallback(
    (title: string) => {
      patchDraft(
        slugFollowsTitle
          ? { title, slug: slugify(title) || "untitled" }
          : { title },
      );
    },
    [patchDraft, slugFollowsTitle],
  );

  const slugError = useMemo(() => {
    if (!draft.slug) {
      return null;
    }
    const parsed = blogSlugSchema.safeParse(draft.slug);
    return parsed.success
      ? null
      : (parsed.error.issues[0]?.message ?? "Invalid slug.");
  }, [draft.slug]);

  async function togglePublished(next: boolean) {
    if (next && !draft.title.trim()) {
      toast.error("Give the post a title before publishing.");
      return;
    }
    setPublishing(true);
    // Flush any pending edit first, so publishing never ships the version from
    // before the last few keystrokes.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    const result = await save({
      title: draft.title,
      slug: draft.slug,
      excerpt: draft.excerpt,
      coverAssetKey: draft.coverAssetKey,
      tags: draft.tags,
      seoTitle: draft.seoTitle || null,
      seoDescription: draft.seoDescription || null,
      body: bodyRef.current,
      status: next ? "published" : "draft",
    });
    setPublishing(false);

    if (result.ok) {
      setPublished(next);
      toast.success(next ? "Post published." : "Moved back to draft.");
      router.refresh();
    }
  }

  async function remove() {
    if (
      !window.confirm(
        "Delete this post permanently? Images used only by this post are deleted too.",
      )
    ) {
      return;
    }
    const result = await deletePostAction({ id: post.id });
    if (result.ok) {
      toast.success("Post deleted.");
      router.push("/blog");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 mb-2 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <SaveIndicator status={status} />
        <span className="text-xs text-muted">
          {formatReadingTime(readingTime)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="publish-toggle" className="text-xs text-muted">
              {published ? "Published" : "Draft"}
            </Label>
            <Switch
              id="publish-toggle"
              checked={published}
              disabled={publishing}
              onCheckedChange={(checked) => void togglePublished(checked)}
            />
          </div>
        </div>
      </header>

      <div className="pt-6">
        <CoverImageField
          url={draft.coverUrl}
          onChange={(cover) =>
            patchDraft({
              coverAssetKey: cover?.key ?? null,
              coverUrl: cover?.url ?? null,
            })
          }
        />

        {/* The title is a textarea, not an input: long titles wrap instead of
            scrolling sideways inside a one-line box, and a title you cannot
            read while writing it is a small daily annoyance. */}
        <span className="mt-6 flex">Title</span>
        <Textarea
          value={draft.title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Untitled"
          rows={1}
          aria-label="Post title"
          className={cn(
            "mt-1.5 resize-none overflow-hidden border-0",
            "text-xl md:text-2xl font-semibold leading-tight tracking-tight",
            "placeholder:text-muted/50 focus-visible:ring-0",
          )}
          onInput={(event) => {
            // Grow to fit — the reason this is a textarea at all.
            const el = event.currentTarget;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
        />

        <div className="mt-4">
          <TagInput
            value={draft.tags}
            onChange={(tags) => patchDraft({ tags })}
            placeholder="Add a tag…"
            aria-label="Tags"
          />
        </div>

        <div className="mt-8">
          <RichTextEditor
            initialBody={post.body}
            onChange={onBodyChange}
            maxImages={maxImages}
          />
        </div>

        <PostSettingsPanel
          slug={draft.slug}
          slugError={slugError}
          slugLocked={!slugFollowsTitle}
          excerpt={draft.excerpt}
          seoTitle={draft.seoTitle}
          seoDescription={draft.seoDescription}
          title={draft.title}
          publishedAt={publishedAt}
          updatedAt={updatedAt}
          readingMinutes={readingTime}
          onChange={patchDraft}
          onDelete={() => void remove()}
        />
      </div>
    </div>
  );
}
