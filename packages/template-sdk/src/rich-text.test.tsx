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
