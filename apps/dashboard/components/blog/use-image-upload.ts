"use client";

import {
  ASSET_KIND_SPECS,
  isAcceptedImageType,
  type AssetKind,
} from "@resfolio/storage";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export interface UploadedImage {
  /** The R2 object key — what gets stored and what cleanup counts. */
  key: string;
  url: string;
  width?: number;
  height?: number;
}

/**
 * Upload an image to R2 and hand back **both** its key and its URL.
 *
 * The existing `ImageUpload` component returns only the URL, which is right for
 * a profile field that stores a URL. A post body stores the *key* (so the
 * delivery origin can move without orphaning every image — doc 07), so this
 * keeps both halves of the response the route already returns.
 *
 * Validation mirrors the server's, and deliberately runs first: rejecting a
 * 20MB file after uploading it wastes the user's connection to tell them
 * something we knew before we started. `ASSET_KIND_SPECS` is the same table the
 * server enforces against, so the two cannot drift.
 */
export function useImageUpload(kind: AssetKind) {
  const [uploading, setUploading] = useState(false);
  const spec = ASSET_KIND_SPECS[kind];

  const upload = useCallback(
    async (file: File): Promise<UploadedImage | null> => {
      if (!isAcceptedImageType(file.type)) {
        toast.error("Upload a JPEG, PNG, WebP or AVIF image.");
        return null;
      }
      if (file.size > spec.maxBytes) {
        const mb = Math.round(spec.maxBytes / (1024 * 1024));
        toast.error(`That image is too large — the limit is ${mb}MB.`);
        return null;
      }

      setUploading(true);
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("kind", kind);

        const response = await fetch("/api/uploads", { method: "POST", body });
        const result = (await response.json().catch(() => null)) as {
          key?: string;
          url?: string;
          width?: number;
          height?: number;
          error?: string;
        } | null;

        if (!response.ok || !result?.key || !result.url) {
          toast.error(result?.error ?? "Couldn't upload that image.");
          return null;
        }
        return {
          key: result.key,
          url: result.url,
          width: result.width,
          height: result.height,
        };
      } catch {
        toast.error("Couldn't upload that image. Check your connection.");
        return null;
      } finally {
        setUploading(false);
      }
    },
    [kind, spec.maxBytes],
  );

  return { upload, uploading };
}
