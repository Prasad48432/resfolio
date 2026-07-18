"use client";

import { Button, Spinner, cn } from "@resfolio/ui";
import { ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

import { useImageUpload } from "./use-image-upload";

/**
 * The post's cover image.
 *
 * Drag-and-drop as well as click, matching the body editor — once a user learns
 * they can drop an image into the post, dropping one onto the cover slot is the
 * obvious next thing to try, and it should work.
 *
 * Stores the **key** alongside the URL. The URL is what renders; the key is
 * what the cleanup path counts, and it is the half that survives the delivery
 * origin changing (doc 07).
 */
export function CoverImageField({
  url,
  onChange,
}: {
  url: string | null;
  onChange: (cover: { key: string; url: string } | null) => void;
}) {
  const { upload, uploading } = useImageUpload("blogCover");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    const uploaded = await upload(file);
    if (uploaded) {
      onChange({ key: uploaded.key, url: uploaded.url });
    }
  }

  if (url) {
    return (
      <div className="group relative overflow-hidden rounded-xl border border-border">
        {/* `unoptimized` is deliberate: these are already re-encoded WebP at a
            bounded size on the way into R2, so the optimizer would be a second
            pass over bytes that are as small as they are going to get. */}
        <Image
          src={url}
          alt=""
          width={1200}
          height={630}
          unoptimized
          className="h-48 w-full object-cover sm:h-64"
        />
        <div className="absolute right-3 top-3 flex gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </Button>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="Remove cover image"
            onClick={() => onChange(null)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void handleFile(file);
          }}
        />
      </div>
    );
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void handleFile(event.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex h-28 items-center justify-center rounded-xl border border-dashed",
        "transition-colors duration-150",
        dragging
          ? "border-brand bg-brand/5"
          : "border-border hover:border-muted hover:bg-accent/40",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="text-muted"
      >
        {uploading ? (
          <Spinner className="size-4" />
        ) : (
          <ImagePlus className="size-4" />
        )}
        {uploading ? "Uploading…" : "Add a cover image"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void handleFile(file);
        }}
      />
    </div>
  );
}
