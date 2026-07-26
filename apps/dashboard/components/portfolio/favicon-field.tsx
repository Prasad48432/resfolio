"use client";

import { ASSET_KIND_SPECS } from "@resfolio/storage";
import { Button, Spinner } from "@resfolio/ui";
import { ImageUp, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * The site favicon uploader (docs/architecture/07-storage.md). A **general,
 * template-independent** site setting — the browser-tab icon for the public
 * portfolio pages — so it lives here beside the config form rather than inside
 * any one template's schema.
 *
 * Unlike the shared `ImageUpload` (which surfaces only a URL, right for config
 * fields that store one), this keeps the upload response's **key** and hands it
 * to `onSave`: the favicon is stored as a key in its own column so it survives
 * the delivery origin moving (doc 07). The URL is used only for the preview.
 */
const spec = ASSET_KIND_SPECS.favicon;
const MAX_MB = Math.round(spec.maxBytes / (1024 * 1024));

export function FaviconField({
  initialUrl,
  onSave,
  testId,
}: {
  /** The current favicon's public URL, or "" when none is set. */
  initialUrl: string;
  /** Persist the new asset key, or `null` to clear it. */
  onSave: (key: string | null) => Promise<void>;
  testId?: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (file.size > spec.maxBytes) {
      toast.error(`That image is too large — the limit is ${MAX_MB}MB.`);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", "favicon");

      const response = await fetch("/api/uploads", { method: "POST", body });
      const result = (await response.json().catch(() => null)) as {
        key?: string;
        url?: string;
        error?: string;
      } | null;

      if (!response.ok || !result?.key || !result?.url) {
        toast.error(result?.error ?? "Couldn't upload that image.");
        return;
      }
      setUrl(result.url);
      await onSave(result.key);
      toast.success("Favicon updated.");
    } catch {
      toast.error("Couldn't upload that image. Check your connection.");
    } finally {
      setBusy(false);
      // Clear the input so re-picking the same file fires `change` again.
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function remove() {
    setBusy(true);
    try {
      setUrl("");
      await onSave(null);
      toast.success("Favicon removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void upload(file);
          }
        }}
      />

      <div className="flex items-center gap-3">
        {url ? (
          <div className="relative size-10 shrink-0 overflow-hidden rounded-md border border-border bg-surface-warm">
            <Image src={url} alt="" fill sizes="40px" className="object-cover" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label="Upload a favicon"
            className="flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-surface-warm text-muted transition-colors duration-(--duration-fast) ease-out hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Spinner className="size-4" />
            ) : (
              <ImageUp className="size-4" aria-hidden />
            )}
          </button>
        )}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Spinner className="size-3.5" /> : null}
            {url ? "Replace" : "Upload"}
          </Button>
          {url ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 className="size-3.5" aria-hidden />
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-[11px] text-muted/80">
        A square PNG works best · JPEG, PNG, WebP or AVIF · up to {MAX_MB}MB.
        Shown in the browser tab on your published portfolio.
      </p>
    </div>
  );
}
