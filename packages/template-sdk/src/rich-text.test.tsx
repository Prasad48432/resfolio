import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderRichText, richTextToPlainText } from "./rich-text";

const html = (input: string): string =>
  renderToStaticMarkup(<>{renderRichText(input)}</>);

describe("renderRichText", () => {
  it("renders bold and italic", () => {
    expect(html("**bold** and _soft_")).toBe(
      "<strong>bold</strong> and <em>soft</em>",
    );
  });

  it("renders a safe link as an anchor", () => {
    expect(html("see [my site](https://example.com)")).toBe(
      'see <a href="https://example.com">my site</a>',
    );
  });

  it("degrades an unsafe link to plain text (no anchor)", () => {
    const out = html("run [now](javascript:alert(1))");
    expect(out).toContain("now");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("javascript:");
  });

  it("never emits raw HTML from the input", () => {
    const out = html("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("returns null for empty input", () => {
    expect(renderRichText("")).toBeNull();
    expect(renderRichText(undefined)).toBeNull();
  });

  it("renders a hyphen list as a <ul>", () => {
    expect(html("- one\n- two")).toBe(
      '<ul class="rf-rich-list"><li>one</li><li>two</li></ul>',
    );
  });

  it("applies inline markup inside a list item", () => {
    expect(html("- **shipped** [it](https://x.io)")).toBe(
      '<ul class="rf-rich-list"><li><strong>shipped</strong> <a href="https://x.io">it</a></li></ul>',
    );
  });

  it("keeps prose and a following list as separate blocks", () => {
    expect(html("Intro line\n- one")).toBe(
      '<p>Intro line</p><ul class="rf-rich-list"><li>one</li></ul>',
    );
  });

  it("does not treat an asterisk bullet as a list (it is the emphasis marker)", () => {
    // `* text *` would otherwise be ambiguous with italics; hyphen is the one
    // documented marker, so this must stay inline.
    expect(html("* not a bullet")).not.toContain("<ul");
  });

  // The single-line case is the overwhelming majority of resume prose, and it
  // must keep rendering bare — a <p> wrapper would reflow every existing
  // resume to add a feature none of them use.
  it("emits no wrapper element for a single prose line", () => {
    expect(html("Just prose")).toBe("Just prose");
  });
});

describe("richTextToPlainText", () => {
  it("strips all markup", () => {
    expect(
      richTextToPlainText(
        "**Cut latency** by _43%_ — see [more](https://x.io)",
      ),
    ).toBe("Cut latency by 43% — see more");
  });

  it("returns empty for empty input", () => {
    expect(richTextToPlainText(undefined)).toBe("");
  });
});
