"use client";

import { blogBodySchema, countBodyImages, type BlogBody } from "@resfolio/blog";
import { cn } from "@resfolio/ui";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { BlogImage, Callout } from "./extensions";
import { EditorToolbar } from "./editor-toolbar";
import { ImageCaptionBar } from "./image-caption-bar";
import { useImageUpload } from "./use-image-upload";

/**
 * The writing surface.
 *
 * ## Uncontrolled on purpose
 *
 * The editor owns its document; React is told about changes but never pushes
 * them back. Driving ProseMirror from React state means every keystroke
 * round-trips through a re-render and a `setContent`, which destroys the
 * selection and makes typing feel laggy — the exact opposite of the goal. The
 * initial content is set once; after that `onUpdate` reports outward and
 * nothing writes inward.
 *
 * ## Validated in the browser with the server's own schema
 *
 * `blogBodySchema` comes from the pure root of `@resfolio/blog`, so what the
 * editor checks before saving is *literally* what the server will check —
 * not a second copy that drifts. A document that fails here would fail there,
 * so we can refuse it early and keep the user's work on screen.
 */
export function RichTextEditor({
  initialBody,
  onChange,
  maxImages,
}: {
  initialBody: BlogBody;
  onChange: (body: BlogBody) => void;
  maxImages: number;
}) {
  const { upload, uploading } = useImageUpload("blogImage");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageCount, setImageCount] = useState(() =>
    countBodyImages(initialBody),
  );
  // Read inside ProseMirror event handlers, which are created once and would
  // otherwise close over the first render's count forever.
  const imageCountRef = useRef(imageCount);
  imageCountRef.current = imageCount;

  /**
   * Indirection through a ref, and not for style.
   *
   * `editorProps` is evaluated inline in the `useEditor` call below, while the
   * paste/drop handler needs `editor` (to insert the uploaded node) — a cycle
   * that, written directly, reads the handler `const` before it initializes and
   * throws. ProseMirror's handlers are also installed once and would capture
   * the first render's closure regardless, so a ref is what keeps them current
   * as well as what breaks the cycle.
   */
  const imageEventRef = useRef<(transfer: DataTransfer | null) => boolean>(
    () => false,
  );

  const editor = useEditor({
    // Next renders this on the server first; without this flag TipTap warns
    // about the hydration mismatch its own contenteditable causes.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Matches the domain schema, which allows a `language` attr and
        // arbitrary text content.
        codeBlock: { HTMLAttributes: { spellcheck: "false" } },
        link: {
          openOnClick: false,
          autolink: true,
          // The editor's half of the schema's scheme allowlist. The server
          // rejects anything else regardless; this stops it being typed.
          protocols: ["http", "https", "mailto"],
          HTMLAttributes: { rel: "noopener noreferrer nofollow" },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      BlogImage,
      Callout,
      Placeholder.configure({
        placeholder: "Write something worth reading…",
      }),
    ],
    content: initialBody,
    editorProps: {
      attributes: {
        class: "rf-prose min-h-[24rem] py-8",
        // Long-form prose wants spellcheck on; the dashboard's dense forms
        // generally don't.
        spellcheck: "true",
      },
      handlePaste: (_view, event) => imageEventRef.current(event.clipboardData),
      handleDrop: (_view, event) => imageEventRef.current(event.dataTransfer),
    },
    onUpdate: ({ editor: instance }) => {
      const json = instance.getJSON();
      const parsed = blogBodySchema.safeParse(json);
      if (!parsed.success) {
        // Should be unreachable: the extension set and the schema are built to
        // match. If it happens, the user's typing is not lost — we simply stop
        // reporting outward, so the last valid body remains what gets saved.
        return;
      }
      setImageCount(countBodyImages(parsed.data));
      onChange(parsed.data);
    },
  });

  const insertImages = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const uploaded = await upload(file);
        if (!uploaded || !editor) {
          continue;
        }
        // Inserted at the cursor, per the requirement — `setBlogImage` uses
        // `insertContent`, which respects the current selection.
        editor
          .chain()
          .focus()
          .setBlogImage({
            assetKey: uploaded.key,
            src: uploaded.url,
            alt: "",
            caption: "",
            width: uploaded.width ?? null,
            height: uploaded.height ?? null,
          })
          .run();
      }
    },
    [editor, upload],
  );

  /**
   * Paste and drop share one path, because they are the same intent expressed
   * two ways and should behave identically (the requirement named GitHub,
   * where they do).
   *
   * Returning `true` tells ProseMirror we handled the event — which is what
   * stops the browser from *also* inserting the image as a `blob:` or `data:`
   * URL that would break the moment the page reloads.
   */
  const handleImageEvent = useCallback(
    (transfer: DataTransfer | null): boolean => {
      const files = Array.from(transfer?.files ?? []).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (files.length === 0) {
        // Not an image — let ProseMirror handle the paste normally, which is
        // what preserves pasted rich text.
        return false;
      }

      const remaining = maxImages - imageCountRef.current;
      if (remaining <= 0) {
        toast.error(`This post is limited to ${maxImages} images.`);
        return true;
      }

      const accepted = files.slice(0, remaining);
      if (accepted.length < files.length) {
        toast.warning(
          `Only ${accepted.length} of ${files.length} images fit — the limit is ${maxImages}.`,
        );
      }

      void insertImages(accepted);
      return true;
    },
    [maxImages, insertImages],
  );

  // Kept current on every render so the handlers installed once inside
  // ProseMirror always call the latest closure.
  imageEventRef.current = handleImageEvent;

  const pickImage = useCallback(() => {
    if (imageCount >= maxImages) {
      toast.error(`This post is limited to ${maxImages} images.`);
      return;
    }
    fileInputRef.current?.click();
  }, [imageCount, maxImages]);

  if (!editor) {
    return <EditorSkeleton />;
  }

  const atLimit = imageCount >= maxImages;

  return (
    <div className="flex flex-col">
      <EditorToolbar
        editor={editor}
        onInsertImage={pickImage}
        imageDisabled={atLimit || uploading}
        imageDisabledReason={
          atLimit ? `Limit of ${maxImages} images reached` : undefined
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Reset first: picking the same file twice in a row fires no change
          // event otherwise, and re-adding an image you just deleted is an
          // ordinary thing to do.
          event.target.value = "";
          const remaining = maxImages - imageCount;
          if (files.length > 0) {
            void insertImages(files.slice(0, Math.max(0, remaining)));
          }
        }}
      />

      <ImageCaptionBar editor={editor} />

      {/* Clicking the empty space below the last block should put the cursor at
          the end — a tall click target is the difference between "a text box"
          and "a page you write on". */}
      <div
        className="flex-1 cursor-text"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            editor.chain().focus("end").run();
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>

      <EditorFooter
        editor={editor}
        imageCount={imageCount}
        maxImages={maxImages}
        uploading={uploading}
      />
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-3 py-8" aria-hidden>
      {[92, 80, 96, 60].map((width) => (
        <div
          key={width}
          className="h-4 animate-pulse rounded bg-accent"
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  );
}

/** Word count and image budget — the two numbers a writer glances at. */
function EditorFooter({
  editor,
  imageCount,
  maxImages,
  uploading,
}: {
  editor: Editor;
  imageCount: number;
  maxImages: number;
  uploading: boolean;
}) {
  const [words, setWords] = useState(0);

  useEffect(() => {
    const update = () => {
      const text = editor.getText().trim();
      setWords(text ? text.split(/\s+/u).length : 0);
    };
    update();
    editor.on("update", update);
    return () => {
      editor.off("update", update);
    };
  }, [editor]);

  return (
    <div className="mt-6 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted">
      <span>
        {words} {words === 1 ? "word" : "words"}
      </span>
      <span className={cn(imageCount >= maxImages && "text-foreground")}>
        {imageCount} / {maxImages} images
      </span>
      {uploading ? <span className="text-brand">Uploading…</span> : null}
      <span className="ml-auto hidden sm:inline opacity-70">
        Paste or drag an image to upload it
      </span>
    </div>
  );
}
