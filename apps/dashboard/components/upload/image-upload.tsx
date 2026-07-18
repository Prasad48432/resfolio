"use client";

import { ASSET_KIND_SPECS, type AssetKind } from "@resfolio/storage";
import { Button, Spinner } from "@resfolio/ui";
import { ImageUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import Image from "next/image";

/**
 * Upload an image to R2 and hand back its public URL
 * (docs/architecture/07-storage.md).
 *
 * **Users never paste an image URL.** Asking someone to find a hosting service,
 * upload there, copy a link and paste it back is four steps of homework for
 * something the product should just do — and the links people find that way
 * are hotlinks to pages they don't control, which rot.
 *
 * The size and dimension guidance shown here is read from `ASSET_KIND_SPECS`,
 * the same table the server enforces against, so the advice and the rule
 * cannot drift.
 */
export function ImageUpload({
  kind,
  value,
  onChange,
  id,
  testId,
  invalid,
  recommended,
}: {
  kind: AssetKind;
  /** The current public URL, or "" when empty. */
  value: string;
  onChange: (url: string) => void;
  id?: string;
  testId?: string;
  invalid?: boolean;
  /** The dimensions this slot is designed around, when the template says so.
   * Falls back to the kind's own ceiling. */
  recommended?: { width: number; height: number };
}) {
  const spec = ASSET_KIND_SPECS[kind];
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const size = recommended ?? spec.maxDimensions;
  const maxMb = Math.round(spec.maxBytes / (1024 * 1024));

  async function upload(file: File) {
    // Check the size before spending the round trip — the server enforces the
    // same limit, but a 20MB upload that fails after uploading is a waste of
    // the user's connection and their patience.
    if (file.size > spec.maxBytes) {
      toast.error(`That image is too large — the limit is ${maxMb}MB.`);
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);

      const response = await fetch("/api/uploads", { method: "POST", body });
      const result = (await response.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;

      if (!response.ok || !result?.url) {
        toast.error(result?.error ?? "Couldn't upload that image.");
        return;
      }
      onChange(result.url);
    } catch {
      toast.error("Couldn't upload that image. Check your connection.");
    } finally {
      setUploading(false);
      // Clear the input so re-picking the *same* file fires `change` again —
      // otherwise a failed upload can't be retried without picking something
      // else first.
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void upload(file);
          }
        }}
      />

      {value ? (
        <div className="p-2 border border-border rounded-lg h-25 w-25">
          <Image
            src={value}
            width={500}
            height={500}
            className="w-full h-full rounded-lg object-cover"
            alt={"UserImage"}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-invalid={invalid || undefined}
          className="flex h-28 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface-warm text-xs text-muted transition-colors duration-(--duration-fast) ease-out hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive"
        >
          {uploading ? (
            <Spinner className="size-5" />
          ) : (
            <ImageUp className="size-5" aria-hidden />
          )}
          <span>{uploading ? "Uploading…" : "Choose an image"}</span>
        </button>
      )}

      <div className="flex items-center gap-2">
        {value ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Spinner className="size-3.5" /> : null}
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => onChange("")}
            >
              <Trash2 className="size-3.5" aria-hidden />
              Remove
            </Button>
          </>
        ) : null}
      </div>

      <p className="text-[11px] text-muted/80">
        Recommended {size.width}×{size.height}px · JPEG, PNG, WebP or AVIF · up
        to {maxMb}MB. Large images are resized and compressed automatically.
      </p>
    </div>
  );
}
