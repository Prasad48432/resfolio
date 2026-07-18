import { describe, expect, it } from "vitest";

import { blogBodySchema, emptyBlogBody, type BlogBody } from "./content";
import {
  blogBodyText,
  collectBodyAssetKeys,
  countBodyImages,
  deriveExcerpt,
  formatReadingTime,
  readingMinutes,
  slugify,
  uniqueSlug,
  WORDS_PER_MINUTE,
} from "./derive";

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function bodyOf(...content: unknown[]): BlogBody {
  return blogBodySchema.parse({ type: "doc", content });
}

describe("blogBodyText", () => {
  it("reads text in document order", () => {
    const body = bodyOf(paragraph("first"), paragraph("second"));
    expect(blogBodyText(body)).toBe("first second");
  });

  it("descends into nested blocks", () => {
    const body = bodyOf({
      type: "blockquote",
      content: [
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [paragraph("nested")] }],
        },
      ],
    });
    expect(blogBodyText(body)).toBe("nested");
  });

  it("excludes code blocks but includes image captions", () => {
    const body = bodyOf(
      paragraph("prose"),
      {
        type: "codeBlock",
        attrs: { language: "ts" },
        content: [{ type: "text", text: "const a = 1;" }],
      },
      {
        type: "image",
        attrs: {
          assetKey: "u/p/blog/images/a.webp",
          src: "/a.webp",
          caption: "a caption",
        },
      },
    );
    const text = blogBodyText(body);
    expect(text).toContain("prose");
    expect(text).toContain("a caption");
    expect(text).not.toContain("const a = 1;");
  });
});

describe("readingMinutes", () => {
  it("floors at one minute for an empty body", () => {
    expect(readingMinutes(emptyBlogBody())).toBe(1);
  });

  it("scales with word count", () => {
    const words = Array.from(
      { length: WORDS_PER_MINUTE * 4 },
      () => "word",
    ).join(" ");
    expect(readingMinutes(bodyOf(paragraph(words)))).toBe(4);
  });

  it("does not count code toward reading time", () => {
    const code = Array.from({ length: WORDS_PER_MINUTE * 10 }, () => "x").join(
      " ",
    );
    const body = bodyOf({
      type: "codeBlock",
      content: [{ type: "text", text: code }],
    });
    expect(readingMinutes(body)).toBe(1);
  });

  it("formats as a human string", () => {
    expect(formatReadingTime(8)).toBe("8 min read");
  });
});

describe("collectBodyAssetKeys", () => {
  it("collects keys from nested images and dedupes repeats", () => {
    const image = (key: string) => ({
      type: "image",
      attrs: { assetKey: key, src: `https://cdn/${key}` },
    });
    const body = bodyOf(
      image("k1"),
      { type: "blockquote", content: [image("k2")] },
      image("k1"),
    );
    expect(collectBodyAssetKeys(body)).toEqual(new Set(["k1", "k2"]));
    // The same image placed twice is one object, so it costs one against the
    // per-post limit — this is the dedupe the assets table already does.
    expect(countBodyImages(body)).toBe(2);
  });

  it("returns an empty set for a body with no images", () => {
    expect(collectBodyAssetKeys(bodyOf(paragraph("hi"))).size).toBe(0);
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });

  it("degrades accents to base letters rather than dropping them", () => {
    expect(slugify("Séance à Paris")).toBe("seance-a-paris");
  });

  it("collapses runs and trims edge hyphens", () => {
    expect(slugify("  --a   b--  ")).toBe("a-b");
  });

  it("returns empty for input with nothing slug-able", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", () => {
    expect(uniqueSlug("Hello World", new Set())).toBe("hello-world");
  });

  it("suffixes numerically and readably on collision", () => {
    expect(uniqueSlug("Hello World", new Set(["hello-world"]))).toBe(
      "hello-world-2",
    );
    expect(
      uniqueSlug("Hello World", new Set(["hello-world", "hello-world-2"])),
    ).toBe("hello-world-3");
  });

  it("falls back to 'untitled' when the title yields no slug", () => {
    expect(uniqueSlug("???", new Set())).toBe("untitled");
  });
});

describe("deriveExcerpt", () => {
  it("returns short text whole", () => {
    expect(deriveExcerpt(bodyOf(paragraph("Short one.")))).toBe("Short one.");
  });

  it("truncates on a word boundary rather than mid-word", () => {
    const body = bodyOf(paragraph("alpha beta gamma delta epsilon"));
    const excerpt = deriveExcerpt(body, 14);
    expect(excerpt).toBe("alpha beta…");
  });
});
