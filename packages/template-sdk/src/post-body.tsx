import type { BlogBody, BlogMark, BlogNode } from "@resfolio/blog";
import { safeLinkUrlSchema } from "@resfolio/profile";
import { Fragment, type ReactElement, type ReactNode } from "react";

/**
 * Render a post body — the `@resfolio/blog` node tree — to React.
 *
 * The counterpart to `renderRichText`, for the other content grammar (doc 07):
 * profile rich text is a tiny Markdown subset chosen so a resume survives
 * plain-text extraction; a post body is a validated ProseMirror tree that needs
 * headings, code, callouts and images. One renderer each, matched to what
 * reads them.
 *
 * ## Why this is safe by construction
 *
 * There is **no HTML string anywhere in this file** — no `dangerouslySetInnerHTML`,
 * no serialization. Every node becomes a React element chosen by a `switch` over
 * a closed set of `type` values, so markup in a post is not filtered, it is
 * unrepresentable (the same reasoning as the schema's whitelist). An unknown
 * node type renders **nothing**, which is the only safe default: a body could
 * carry a node written by a newer editor than this renderer knows about, and
 * guessing at it is how a sanitiser becomes an injection.
 *
 * Link schemes are **re-checked on output** with the domain's own
 * `safeLinkUrlSchema`, exactly as `renderRichText` does — storage validated
 * them already, and doc 10 says a renderer re-verifies anyway. An unsafe href
 * degrades to plain text, never an anchor.
 *
 * ## Class names are the styling contract
 *
 * Every element carries an `rf-post-*` class and no inline styles, so templates
 * own the look completely. A template that styles none of them still renders
 * readable prose, because the elements are semantic HTML underneath.
 */

const isSafeUrl = (url: string): boolean =>
  safeLinkUrlSchema.safeParse(url).success;

/** Wrap text in its marks, innermost-first. Link is applied last (outermost)
 * so a bold link is `<a><strong>…</strong></a>` rather than a bold element
 * wrapping an anchor — the anchor should be the whole clickable region. */
function applyMarks(
  text: string,
  marks: readonly BlogMark[] | undefined,
  key: string,
): ReactNode {
  let node: ReactNode = text;
  let link: Extract<BlogMark, { type: "link" }> | undefined;

  for (const mark of marks ?? []) {
    switch (mark.type) {
      case "bold":
        node = <strong>{node}</strong>;
        break;
      case "italic":
        node = <em>{node}</em>;
        break;
      case "strike":
        node = <s>{node}</s>;
        break;
      case "code":
        node = <code className="rf-post-code">{node}</code>;
        break;
      case "underline":
        // A styled span, not `<u>`: underline is presentational, and `<u>` has
        // a spelling-error semantic in HTML that this is not.
        node = <span className="rf-post-underline">{node}</span>;
        break;
      case "link":
        link = mark;
        break;
    }
  }

  if (link && isSafeUrl(link.attrs.href)) {
    node = (
      <a
        className="rf-post-link"
        href={link.attrs.href}
        {...(link.attrs.target === "_blank"
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {node}
      </a>
    );
  }

  return <Fragment key={key}>{node}</Fragment>;
}

/** An image node, as a `<figure>` when it has a caption and a bare `<img>`
 * otherwise. `src` is the cached resolved URL (doc 07); the key is the durable
 * identity but resolving it needs a base URL this renderer doesn't have. */
function renderImage(node: BlogNode, key: string): ReactElement | null {
  const src = typeof node.attrs?.["src"] === "string" ? node.attrs["src"] : "";
  if (!src || !isSafeUrl(src)) {
    return null;
  }
  const alt = typeof node.attrs?.["alt"] === "string" ? node.attrs["alt"] : "";
  const caption =
    typeof node.attrs?.["caption"] === "string" ? node.attrs["caption"] : "";

  const img = (
    <img className="rf-post-image" src={src} alt={alt} loading="lazy" />
  );

  return caption ? (
    <figure className="rf-post-figure" key={key}>
      {img}
      <figcaption className="rf-post-caption">{caption}</figcaption>
    </figure>
  ) : (
    <Fragment key={key}>{img}</Fragment>
  );
}

function renderNodes(
  nodes: readonly BlogNode[] | undefined,
  keyPrefix: string,
): ReactNode {
  return (nodes ?? []).map((node, index) =>
    renderNode(node, `${keyPrefix}-${index}`),
  );
}

function renderNode(node: BlogNode, key: string): ReactNode {
  switch (node.type) {
    case "text":
      return applyMarks(node.text ?? "", node.marks, key);

    case "hardBreak":
      return <br key={key} />;

    case "paragraph":
      return (
        <p className="rf-post-p" key={key}>
          {renderNodes(node.content, key)}
        </p>
      );

    case "heading": {
      const level = node.attrs?.["level"];
      // Body headings start at h2: the post title is the page's h1, and two
      // h1s on a page is a real accessibility and SEO fault. A pasted level 1
      // is valid in storage (losing the user's paste would be worse) and is
      // demoted here, where it is a presentation decision.
      const Tag = level === 3 ? "h4" : level === 2 ? "h3" : "h2";
      return (
        <Tag className="rf-post-h" key={key}>
          {renderNodes(node.content, key)}
        </Tag>
      );
    }

    case "codeBlock": {
      const language = node.attrs?.["language"];
      return (
        <pre className="rf-post-pre" key={key}>
          <code
            className="rf-post-codeblock"
            {...(typeof language === "string" && language
              ? { "data-language": language }
              : {})}
          >
            {(node.content ?? []).map((child) => child.text ?? "").join("")}
          </code>
        </pre>
      );
    }

    case "blockquote":
      return (
        <blockquote className="rf-post-quote" key={key}>
          {renderNodes(node.content, key)}
        </blockquote>
      );

    case "bulletList":
      return (
        <ul className="rf-post-ul" key={key}>
          {renderNodes(node.content, key)}
        </ul>
      );

    case "orderedList": {
      const start = node.attrs?.["start"];
      return (
        <ol
          className="rf-post-ol"
          key={key}
          {...(typeof start === "number" && start !== 1 ? { start } : {})}
        >
          {renderNodes(node.content, key)}
        </ol>
      );
    }

    case "listItem":
      return (
        <li className="rf-post-li" key={key}>
          {renderNodes(node.content, key)}
        </li>
      );

    case "taskList":
      // `list-style: none` is the template's job, but the role is ours: this
      // is a checklist, not prose, and it reads as one to a screen reader.
      return (
        <ul className="rf-post-tasks" key={key}>
          {renderNodes(node.content, key)}
        </ul>
      );

    case "taskItem": {
      const checked = node.attrs?.["checked"] === true;
      return (
        <li className="rf-post-task" data-checked={checked} key={key}>
          {/* Disabled, not read-only: a published post is not a form, and a
              focusable checkbox that cannot change is a keyboard trap with no
              payoff. The state is also announced, not just drawn. */}
          <input type="checkbox" checked={checked} disabled readOnly />
          <span>{renderNodes(node.content, key)}</span>
        </li>
      );
    }

    case "callout": {
      const tone = node.attrs?.["tone"];
      return (
        <div
          className="rf-post-callout"
          data-tone={typeof tone === "string" ? tone : "info"}
          key={key}
        >
          {renderNodes(node.content, key)}
        </div>
      );
    }

    case "image":
      return renderImage(node, key);

    case "horizontalRule":
      return <hr className="rf-post-hr" key={key} />;

    default:
      // Unknown node type — render nothing. See the header: guessing is how a
      // sanitiser becomes an injection.
      return null;
  }
}

/**
 * Render a validated post body to React.
 *
 * Deterministic: same body, same markup. No clock, no locale, no randomness
 * (doc 09), so a cached render and a fresh one are byte-identical.
 */
export function renderPostBody(body: BlogBody): ReactNode {
  return renderNodes(body.content as readonly BlogNode[] | undefined, "pb");
}

/**
 * A post body as plain text — for meta descriptions and previews.
 *
 * Mirrors `richTextToPlainText`. Code blocks are **excluded**, matching the
 * reading-time calculation in `@resfolio/blog`: a config dump is not prose, and
 * letting one supply a page's meta description produces a search result made of
 * YAML.
 */
export function postBodyToPlainText(body: BlogBody): string {
  const parts: string[] = [];

  const walk = (nodes: readonly BlogNode[] | undefined): void => {
    for (const node of nodes ?? []) {
      if (node.type === "codeBlock") {
        continue;
      }
      if (node.type === "text" && node.text) {
        parts.push(node.text);
      }
      walk(node.content);
    }
  };

  walk(body.content as readonly BlogNode[] | undefined);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
