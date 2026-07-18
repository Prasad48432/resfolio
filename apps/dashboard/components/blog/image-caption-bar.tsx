"use client";

import { Input, Button, cn } from "@resfolio/ui";
import type { Editor } from "@tiptap/react";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Caption and alt-text editing for the selected image.
 *
 * A contextual bar rather than an inline `contenteditable` caption under each
 * image. The caption is an *attribute* of the image node, not child content
 * (see the domain schema), which keeps the document shape flat and means a
 * caption can never accidentally contain another image or a list. The cost is
 * that it cannot be typed into directly, so it gets a bar that appears only
 * when an image is selected — and that turns out to be the better interaction
 * anyway: captions are written once, and a permanently visible empty caption
 * field under every image is clutter on a screen meant to be calm.
 *
 * Alt text sits here too, next to the caption, because that is the one moment
 * the author is thinking about this specific image. Buried in a settings panel,
 * it never gets written.
 */
export function ImageCaptionBar({ editor }: { editor: Editor }) {
  const [selection, setSelection] = useState<{
    active: boolean;
    caption: string;
    alt: string;
  }>({ active: false, caption: "", alt: "" });

  useEffect(() => {
    const sync = () => {
      const active = editor.isActive("image");
      const attrs = active ? editor.getAttributes("image") : {};
      setSelection({
        active,
        caption: (attrs.caption as string) ?? "",
        alt: (attrs.alt as string) ?? "",
      });
    };
    sync();
    // Selection changes and document changes can both make an image current.
    editor.on("selectionUpdate", sync);
    editor.on("transaction", sync);
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("transaction", sync);
    };
  }, [editor]);

  if (!selection.active) {
    return null;
  }

  function update(attrs: { caption?: string; alt?: string }) {
    // `focus: false` — updating an attribute must not yank the caret out of the
    // input the user is typing in.
    editor.chain().updateAttributes("image", attrs).run();
  }

  return (
    <div
      className={cn(
        "mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border",
        "bg-accent/40 px-3 py-2",
        // Slides in rather than appearing — the bar is a response to the user's
        // selection, and motion is what connects the two.
        "animate-in fade-in slide-in-from-top-1 duration-150",
      )}
    >
      <span className="label-section shrink-0">Image</span>
      <Input
        value={selection.caption}
        placeholder="Caption (optional)"
        aria-label="Image caption"
        className="h-8 min-w-40 flex-1"
        onChange={(event) => {
          const caption = event.target.value;
          setSelection((previous) => ({ ...previous, caption }));
          update({ caption });
        }}
      />
      <Input
        value={selection.alt}
        placeholder="Alt text"
        aria-label="Image alt text"
        className="h-8 min-w-40 flex-1"
        onChange={(event) => {
          const alt = event.target.value;
          setSelection((previous) => ({ ...previous, alt }));
          update({ alt });
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Remove image"
        className="size-8 text-muted hover:text-danger"
        onMouseDown={(event) => {
          event.preventDefault();
          editor.chain().focus().deleteSelection().run();
        }}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
