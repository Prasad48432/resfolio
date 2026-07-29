/**
 * Fetch a file and save it, rather than navigating to it.
 *
 * **The plain `<a download>` was the bug this replaces.** A generated PDF takes
 * a moment, and an anchor gives no sign it has been pressed — so people press it
 * again and queue a second render. Worse, the routes' real failure modes answer
 * with JSON (`{ error }`), which a navigation displays to the user as raw text on
 * a blank page.
 *
 * Fetching buys a real in-flight state the caller can render, click suppression,
 * and an error the caller can turn into a sentence. The cost is buffering the
 * file in memory, which is fine at resume and letter size and would not be for
 * something large.
 *
 * Shared by the resume export and the cover letter, because both learned the same
 * lesson and a second copy would only learn half of it.
 */
export interface DownloadResult {
  ok: boolean;
  /** The server's own explanation, when it sent one. Routes here answer
   * `{ error }` for the cases they can explain and nothing for the rest. */
  error?: string;
}

export async function downloadFile(
  url: string,
  fallbackName: string,
  /** A JSON body, when the file is drawn from something the browser is holding
   * rather than from something the server already stored — the cover letter on
   * screen, which must be downloadable whether or not its save round-tripped.
   * Absent, this is a plain `GET`. */
  body?: unknown,
): Promise<DownloadResult> {
  let response: Response;
  try {
    response =
      body === undefined
        ? await fetch(url)
        : await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
  } catch {
    return { ok: false };
  }

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => undefined);
    return { ok: false, error: detail };
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  // Prefer the server's own filename: it knows the resume's name or the
  // company the letter is for, and the caller only knows a fallback.
  anchor.download = filenameFrom(response) ?? fallbackName;
  anchor.click();
  // Revoking immediately can race the download in Safari; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);

  return { ok: true };
}

export function filenameFrom(response: Response): string | undefined {
  const header = response.headers.get("content-disposition");
  const match = header ? /filename="([^"]+)"/.exec(header) : null;
  return match?.[1];
}
