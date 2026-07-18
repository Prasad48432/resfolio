import type { BlogBody, BlogNode } from "./content";

/**
 * Values derived from a post body. All pure, all deterministic — the same body
 * always yields the same slug candidate, reading time and key set.
 *
 * These are the reason the body is structured JSON rather than a string: every
 * one of them is a walk over typed nodes instead of a regex over prose that
 * happens to look like markup.
 */

/**
 * Depth-first walk over a body.
 *
 * `prune` skips a node **and its entire subtree**. That distinction is the
 * whole reason this takes a predicate rather than callers filtering the
 * output: a code block's text lives in child `text` nodes, so filtering the
 * `codeBlock` node out of a flat stream still yields every line of code inside
 * it. Reading time counted code for exactly that reason until a test caught it.
 */
function* walk(
  node: BlogNode,
  prune?: (node: BlogNode) => boolean,
): Generator<BlogNode> {
  if (prune?.(node)) {
    return;
  }
  yield node;
  for (const child of node.content ?? []) {
    yield* walk(child, prune);
  }
}

function* walkBody(
  body: BlogBody,
  prune?: (node: BlogNode) => boolean,
): Generator<BlogNode> {
  for (const child of body.content ?? []) {
    yield* walk(child as BlogNode, prune);
  }
}

/**
 * Words per minute for reading-time estimation.
 *
 * 225 is the middle of the range measured for adults reading technical prose on
 * screen. The number matters less than it being fixed and applied consistently
 * — a reading time is a signal of length, not a promise.
 */
export const WORDS_PER_MINUTE = 225;

/**
 * Plain text of a body, in reading order.
 *
 * Code blocks are **excluded**. Reading time is meant to tell someone how long
 * the prose takes; a 300-line config dump is not read word by word, and
 * counting it produces "22 min read" on a post someone skims in three. Image
 * captions are included — they are prose.
 */
export function blogBodyText(body: BlogBody): string {
  const parts: string[] = [];
  for (const node of walkBody(body, (node) => node.type === "codeBlock")) {
    if (node.type === "text" && typeof node.text === "string") {
      parts.push(node.text);
    }
    if (node.type === "image") {
      const caption = node.attrs?.caption;
      if (typeof caption === "string" && caption.length > 0) {
        parts.push(caption);
      }
    }
  }
  return parts.join(" ");
}

/**
 * Estimated reading time in whole minutes, floor 1.
 *
 * **Never user-editable** — the request was explicit, and it is also the right
 * call: a hand-entered reading time is wrong the moment the post is edited, and
 * nothing ever notices. The repository recomputes this on every write, so the
 * column cannot drift from the body it describes.
 */
export function readingMinutes(body: BlogBody): number {
  const words = blogBodyText(body).split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Human form of the above: "1 min read", "8 min read". */
export function formatReadingTime(minutes: number): string {
  return `${Math.max(1, minutes)} min read`;
}

/**
 * Every R2 object key a body embeds.
 *
 * This is the input to image cleanup, and it reads `attrs.assetKey` rather than
 * parsing `attrs.src`. That is deliberate: the delivery origin is expected to
 * move (r2.dev → custom domain), and a cleanup routine anchored to a hostname
 * would see every live image as orphaned the day it does (doc 07,
 * `assetKeyFromUrl`).
 */
export function collectBodyAssetKeys(body: BlogBody): Set<string> {
  const keys = new Set<string>();
  for (const node of walkBody(body)) {
    if (node.type !== "image") {
      continue;
    }
    const key = node.attrs?.assetKey;
    if (typeof key === "string" && key.length > 0) {
      keys.add(key);
    }
  }
  return keys;
}

/** How many images a body embeds — counted as *distinct keys*, matching the
 * dedupe in the assets table: the same image placed twice is one object, so it
 * costs one against the limit. */
export function countBodyImages(body: BlogBody): number {
  return collectBodyAssetKeys(body).size;
}

/**
 * Auto-generated excerpt: the opening prose of the post.
 *
 * Used only as a *fallback* when the author has not written one — the excerpt
 * is a real field they own, and silently overwriting it on every save would
 * make it impossible to keep one that differs from the opening line.
 */
export function deriveExcerpt(body: BlogBody, maxLength = 200): string {
  const text = blogBodyText(body).replace(/\s+/gu, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  // Cut at a word boundary so the ellipsis never lands mid-word.
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * A URL-safe slug from arbitrary text.
 *
 * NFKD-normalises first so accented characters degrade to their base letter
 * ("Séance" → "seance") rather than being stripped to nothing — a title in a
 * language with accents should not produce an empty slug.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    // Strip combining marks left behind by the decomposition.
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80)
    .replace(/-+$/gu, "");
  return slug;
}

/**
 * A slug that does not collide with `taken`.
 *
 * Collision handling is a numeric suffix rather than a random one so the second
 * "Hello World" is `hello-world-2` — guessable and readable, which matters for
 * a URL a person will see and type.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = slugify(base) || "untitled";
  if (!taken.has(root)) {
    return root;
  }
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  // Pathological only — a thousand posts sharing one title.
  return `${root}-${Date.now()}`;
}
