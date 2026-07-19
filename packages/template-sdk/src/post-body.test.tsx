import type { BlogBody } from "@resfolio/blog";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { postBodyToPlainText, renderPostBody } from "./post-body";

/**
 * The post body renderer. Two things are being tested: that every node type in
 * the domain's whitelist reaches sensible markup, and — more importantly — that
 * the ways a body could carry an injection all fail closed.
 */

function doc(...content: unknown[]): BlogBody {
  return { type: "doc", content } as BlogBody;
}

const render = (body: BlogBody): string =>
  renderToStaticMarkup(<>{renderPostBody(body)}</>);

const text = (value: string, marks?: unknown[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

const para = (...content: unknown[]) => ({ type: "paragraph", content });

describe("renderPostBody — structure", () => {
  it("renders paragraphs and inline marks", () => {
    const html = render(
      doc(
        para(
          text("plain "),
          text("bold", [{ type: "bold" }]),
          text("italic", [{ type: "italic" }]),
          text("struck", [{ type: "strike" }]),
          text("coded", [{ type: "code" }]),
        ),
      ),
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<s>struck</s>");
    expect(html).toContain("rf-post-code");
  });

  it("renders underline as a styled span, not <u>", () => {
    // `<u>` carries a spelling-error semantic in HTML that this is not.
    const html = render(doc(para(text("under", [{ type: "underline" }]))));
    expect(html).toContain("rf-post-underline");
    expect(html).not.toContain("<u>");
  });

  it("demotes body headings so the post title stays the only h1", () => {
    const html = render(
      doc(
        { type: "heading", attrs: { level: 1 }, content: [text("One")] },
        { type: "heading", attrs: { level: 2 }, content: [text("Two")] },
        { type: "heading", attrs: { level: 3 }, content: [text("Three")] },
      ),
    );
    expect(html).not.toContain("<h1");
    expect(html).toContain("<h2 class=\"rf-post-h\">One</h2>");
    expect(html).toContain("<h3 class=\"rf-post-h\">Two</h3>");
    expect(html).toContain("<h4 class=\"rf-post-h\">Three</h4>");
  });

  it("renders a code block with its language and no lost whitespace", () => {
    const html = render(
      doc({
        type: "codeBlock",
        attrs: { language: "rust" },
        content: [text("fn main() {\n    println!();\n}")],
      }),
    );
    expect(html).toContain('data-language="rust"');
    expect(html).toContain("fn main()");
    expect(html).toContain("println!();");
  });

  it("renders lists, task items and their checked state", () => {
    const html = render(
      doc(
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [para(text("a"))] }],
        },
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [para(text("done"))] },
            { type: "taskItem", attrs: { checked: false }, content: [para(text("todo"))] },
          ],
        },
      ),
    );
    expect(html).toContain("rf-post-ul");
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
    // Disabled, not merely unchecked: a published post is not a form.
    expect(html).toContain("disabled");
  });

  it("preserves an ordered list's start only when it isn't 1", () => {
    const from5 = render(
      doc({ type: "orderedList", attrs: { start: 5 }, content: [] }),
    );
    expect(from5).toContain('start="5"');
    const from1 = render(
      doc({ type: "orderedList", attrs: { start: 1 }, content: [] }),
    );
    expect(from1).not.toContain("start=");
  });

  it("renders a callout with its tone and a figure only when captioned", () => {
    const html = render(
      doc(
        { type: "callout", attrs: { tone: "warning" }, content: [para(text("careful"))] },
        {
          type: "image",
          attrs: {
            assetKey: "u/p/blog/a.webp",
            src: "https://cdn.example.com/a.webp",
            alt: "A",
            caption: "The caption",
          },
        },
        {
          type: "image",
          attrs: {
            assetKey: "u/p/blog/b.webp",
            src: "https://cdn.example.com/b.webp",
            alt: "B",
            caption: "",
          },
        },
      ),
    );
    expect(html).toContain('data-tone="warning"');
    expect(html).toContain("<figcaption");
    expect(html).toContain("The caption");
    // Exactly one figure: the uncaptioned image is a bare <img>.
    expect(html.split("<figure").length - 1).toBe(1);
  });
});

describe("renderPostBody — safety", () => {
  it("never emits raw HTML from text content", () => {
    const html = render(doc(para(text("<script>alert(1)</script>"))));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("degrades an unsafe link scheme to plain text, never an anchor", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,<x>"]) {
      const html = render(
        doc(para(text("click", [{ type: "link", attrs: { href } }]))),
      );
      expect(html).toContain("click");
      expect(html).not.toContain("<a");
      expect(html).not.toContain(href);
    }
  });

  it("keeps a safe link and marks a new-tab link noopener", () => {
    const linked = render(
      doc(
        para(
          text("go", [
            {
              type: "link",
              attrs: { href: "https://example.com", target: "_blank" },
            },
          ]),
        ),
      ),
    );
    expect(linked).toContain('href="https://example.com"');
    expect(linked).toContain('rel="noopener noreferrer"');
  });

  it("drops an image whose src is not a safe URL", () => {
    const html = render(
      doc({
        type: "image",
        attrs: {
          assetKey: "k",
          src: "javascript:alert(1)",
          alt: "",
          caption: "",
        },
      }),
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
  });

  it("renders nothing for an unknown node type", () => {
    // A body may carry a node from a newer editor than this renderer knows.
    // Guessing at it is how a sanitiser becomes an injection.
    const html = render(
      doc({ type: "somethingNew", content: [text("invisible")] }),
    );
    expect(html).not.toContain("invisible");
  });

  it("is deterministic", () => {
    const body = doc(para(text("same")), { type: "horizontalRule" });
    expect(render(body)).toBe(render(body));
  });
});

describe("postBodyToPlainText", () => {
  it("flattens prose and collapses whitespace", () => {
    expect(
      postBodyToPlainText(doc(para(text("Hello   there")), para(text("Again")))),
    ).toBe("Hello there Again");
  });

  it("excludes code blocks", () => {
    // Matching the reading-time rule: a config dump is not prose, and letting
    // one supply a meta description produces a search result made of YAML.
    const body = doc(
      para(text("Real prose.")),
      { type: "codeBlock", content: [text("const x = 1;")] },
    );
    expect(postBodyToPlainText(body)).toBe("Real prose.");
  });
});
