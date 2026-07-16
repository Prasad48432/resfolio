import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Where a generated PDF lands (docs/architecture/07-storage.md). This is the
 * cloud-gated seam of the pipeline: today a `LocalFsExportStore` writes to
 * disk; when Cloudflare R2 credentials land, an `R2ExportStore` implements
 * the same three methods and the Trigger.dev task swaps it in — no other code
 * changes. Objects are immutable and content-addressed (`key` = render hash),
 * so "invalidation" is just a new key.
 */
export interface StoredExport {
  key: string;
  /** A retrievable location — a `file://` URL locally, an HTTPS URL on R2. */
  url: string;
}

export interface ExportStore {
  /** Is an object already stored under this key? (the cache check) */
  head(key: string): Promise<boolean>;
  /** Store bytes under this key and return its location. */
  put(key: string, bytes: Uint8Array): Promise<StoredExport>;
  /** The location an object would have, without touching storage. */
  location(key: string): string;
}

export class LocalFsExportStore implements ExportStore {
  constructor(private readonly dir: string) {}

  private path(key: string): string {
    return join(this.dir, `${key}.pdf`);
  }

  location(key: string): string {
    return pathToFileURL(this.path(key)).href;
  }

  async head(key: string): Promise<boolean> {
    try {
      await stat(this.path(key));
      return true;
    } catch {
      return false;
    }
  }

  async put(key: string, bytes: Uint8Array): Promise<StoredExport> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.path(key), bytes);
    return { key, url: this.location(key) };
  }
}
