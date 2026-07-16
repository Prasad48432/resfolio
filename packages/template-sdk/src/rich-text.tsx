import { Fragment, type ReactNode } from "react";

import { safeLinkUrlSchema } from "@resfolio/profile";

/**
 * Render the profile rich-text subset (docs/architecture/01-profile-engine.md:
 * `**bold**`, `*italic*` / `_italic_`, and `[label](url)` links — never raw
 * HTML) to React. Link schemes are **re-checked on output** with the domain's
 * own `safeLinkUrlSchema` (doc 10: renderers re-verify even though storage
 * already validated); an unsafe URL degrades to plain text, never an anchor.
 */

const isSafeUrl = (url: string): boolean =>
  safeLinkUrlSchema.safeParse(url).success;

/** Ordered alternation: links first, then bold, then italic. Emphasis spans
 * are intentionally non-nesting (`[^*]` / `[^_]`) — enough for resume prose,
 * and it keeps the parser linear and safe. */
const INLINE =
  /\[([^\]]+)\]\(\s*([^)\s]+)\s*\)|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;

export function renderRichText(
  input: string | undefined | null,
  keyPrefix = "rt",
): ReactNode {
  if (!input) {
    return null;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  for (const match of input.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      nodes.push(input.slice(cursor, start));
    }

    const [, linkText, linkUrl, bold, italicStar, italicUnderscore] = match;
    const key = `${keyPrefix}-${index++}`;

    if (linkText && linkUrl) {
      nodes.push(
        isSafeUrl(linkUrl) ? (
          <a key={key} href={linkUrl}>
            {linkText}
          </a>
        ) : (
          <Fragment key={key}>{linkText}</Fragment>
        ),
      );
    } else if (bold) {
      nodes.push(<strong key={key}>{bold}</strong>);
    } else {
      nodes.push(<em key={key}>{italicStar ?? italicUnderscore}</em>);
    }

    cursor = start + match[0].length;
  }

  if (cursor < input.length) {
    nodes.push(input.slice(cursor));
  }

  if (nodes.length === 0) {
    return null;
  }
  return nodes.length === 1 ? nodes[0] : <>{nodes}</>;
}

/**
 * Strip the rich-text markup to plain text — for `<title>`, meta tags, and the
 * ATS text layer where markup would be noise. Mirrors `renderRichText`'s
 * grammar so the two never disagree about what a token means.
 */
export function richTextToPlainText(input: string | undefined | null): string {
  if (!input) {
    return "";
  }
  return input
    .replace(/\[([^\]]+)\]\(\s*[^)\s]+\s*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}
