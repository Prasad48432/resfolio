import { Fragment, type ReactNode } from "react";

import { safeLinkUrlSchema } from "@resfolio/profile";

/**
 * Render the profile rich-text subset (docs/architecture/01-profile-engine.md:
 * `**bold**`, `*italic*` / `_italic_`, `[label](url)` links, and `- ` unordered
 * lists — never raw HTML) to React. Link schemes are **re-checked on output**
 * with the domain's own `safeLinkUrlSchema` (doc 10: renderers re-verify even
 * though storage already validated); an unsafe URL degrades to plain text,
 * never an anchor.
 *
 * Two layers, deliberately: a **block** pass splits lines into list runs and
 * paragraphs, then the **inline** pass below runs within each. Keeping them
 * separate is what lets a list item still carry bold and links without the
 * inline grammar having to know anything about line structure.
 */

const isSafeUrl = (url: string): boolean =>
  safeLinkUrlSchema.safeParse(url).success;

/** Ordered alternation: links first, then bold, then italic. Emphasis spans
 * are intentionally non-nesting (`[^*]` / `[^_]`) — enough for resume prose,
 * and it keeps the parser linear and safe. */
const INLINE =
  /\[([^\]]+)\]\(\s*([^)\s]+)\s*\)|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;

/**
 * A list item marker. **Hyphen only** — `*` is already the bold/italic
 * delimiter, so accepting it as a bullet would make `*emphasis*` at the start
 * of a line ambiguous, and the ambiguity would resolve differently here than
 * in `richTextToPlainText`. One marker, one meaning; the editor's help text
 * documents `-` for the same reason.
 */
const LIST_ITEM = /^\s*-\s+(.*)$/;

/** Inline-only rendering: the grammar within a single line. */
function renderInline(input: string, keyPrefix: string): ReactNode {
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

/** One block: a run of consecutive list items, or a run of prose lines. */
type Block =
  | { kind: "list"; items: string[] }
  | { kind: "text"; lines: string[] };

/** Group lines into list runs and prose runs, preserving order. */
function toBlocks(input: string): Block[] {
  const blocks: Block[] = [];

  for (const line of input.split("\n")) {
    const item = LIST_ITEM.exec(line);
    const last = blocks[blocks.length - 1];

    if (item) {
      if (last?.kind === "list") {
        last.items.push(item[1]!);
      } else {
        blocks.push({ kind: "list", items: [item[1]!] });
      }
      continue;
    }

    // A blank line between prose runs is a paragraph break, not content.
    if (line.trim() === "") {
      if (last?.kind === "text") {
        blocks.push({ kind: "text", lines: [] });
      }
      continue;
    }

    if (last?.kind === "text") {
      last.lines.push(line);
    } else {
      blocks.push({ kind: "text", lines: [line] });
    }
  }

  return blocks.filter(
    (block) => block.kind === "list" || block.lines.length > 0,
  );
}

export function renderRichText(
  input: string | undefined | null,
  keyPrefix = "rt",
): ReactNode {
  if (!input) {
    return null;
  }

  const blocks = toBlocks(input);
  if (blocks.length === 0) {
    return null;
  }

  // The overwhelmingly common case: a single run of prose with no list and no
  // line breaks. Returning the inline nodes bare (no wrapper element) keeps
  // this identical to what every existing template already renders — a
  // paragraph wrapper here would change the spacing of every resume in
  // existence to fix a case that isn't broken.
  if (
    blocks.length === 1 &&
    blocks[0]!.kind === "text" &&
    blocks[0]!.lines.length === 1
  ) {
    return renderInline(blocks[0]!.lines[0]!, keyPrefix);
  }

  return (
    <>
      {blocks.map((block, blockIndex) =>
        block.kind === "list" ? (
          <ul key={`${keyPrefix}-b${blockIndex}`} className="rf-rich-list">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                {renderInline(item, `${keyPrefix}-b${blockIndex}-${itemIndex}`)}
              </li>
            ))}
          </ul>
        ) : (
          <p key={`${keyPrefix}-b${blockIndex}`}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line, `${keyPrefix}-b${blockIndex}-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </>
  );
}

/**
 * Strip the rich-text markup to plain text — for `<title>`, meta tags, and the
 * ATS text layer where markup would be noise. Mirrors `renderRichText`'s
 * grammar so the two never disagree about what a token means, including the
 * list marker: a bullet is structure, so it leaves as nothing rather than as a
 * stray hyphen in a meta description.
 */
export function richTextToPlainText(input: string | undefined | null): string {
  if (!input) {
    return "";
  }
  return input
    .split("\n")
    .map((line) => line.replace(LIST_ITEM, "$1"))
    .join("\n")
    .replace(/\[([^\]]+)\]\(\s*[^)\s]+\s*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}
