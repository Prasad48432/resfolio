import { describe, expect, it } from "vitest";

import { blogBodySchema, emptyBlogBody, MAX_BODY_DEPTH } from "./content";
import { blogSlugSchema, blogTagsSchema, updateBlogPostSchema } from "./post";

describe("blogBodySchema", () => {
  it("accepts an empty document", () => {
    expect(blogBodySchema.parse(emptyBlogBody())).toEqual({
      type: "doc",
      content: [],
    });
  });

  it("accepts the full node vocabulary", () => {
    const body = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "H" }],
        },
        { type: "paragraph", content: [{ type: "text", text: "p" }] },
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "x" }],
        },
        { type: "blockquote", content: [{ type: "paragraph" }] },
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
        },
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [{ type: "paragraph" }],
            },
          ],
        },
        {
          type: "callout",
          attrs: { tone: "warning" },
          content: [{ type: "paragraph" }],
        },
        { type: "image", attrs: { assetKey: "k", src: "https://cdn/k.webp" } },
        { type: "horizontalRule" },
      ],
    };
    expect(() => blogBodySchema.parse(body)).not.toThrow();
  });

  it("rejects an unknown node type", () => {
    // The whole point of the whitelist: HTML is not filtered out, it is simply
    // not representable — there is no node type that carries markup.
    const body = { type: "doc", content: [{ type: "script", content: [] }] };
    expect(() => blogBodySchema.parse(body)).toThrow();
  });

  it("rejects an unknown mark", () => {
    const body = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "x", marks: [{ type: "evil" }] }],
        },
      ],
    };
    expect(() => blogBodySchema.parse(body)).toThrow();
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>",
    "vbscript:x",
    "not a url",
  ])("rejects the unsafe link href %s", (href) => {
    const body = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [{ type: "link", attrs: { href } }],
            },
          ],
        },
      ],
    };
    expect(() => blogBodySchema.parse(body)).toThrow();
  });

  it.each(["https://example.com/a", "http://example.com", "mailto:a@b.com"])(
    "accepts the safe link href %s",
    (href) => {
      const body = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "x",
                marks: [{ type: "link", attrs: { href } }],
              },
            ],
          },
        ],
      };
      expect(() => blogBodySchema.parse(body)).not.toThrow();
    },
  );

  it("rejects a heading level outside 1–3", () => {
    const body = {
      type: "doc",
      content: [{ type: "heading", attrs: { level: 6 }, content: [] }],
    };
    expect(() => blogBodySchema.parse(body)).toThrow();
  });

  it("rejects a document nested past the depth ceiling", () => {
    // Guards validation and rendering, both of which recurse: unbounded nesting
    // would be a stack overflow rather than a validation error.
    let node: unknown = {
      type: "paragraph",
      content: [{ type: "text", text: "deep" }],
    };
    for (let i = 0; i < MAX_BODY_DEPTH + 5; i += 1) {
      node = { type: "blockquote", content: [node] };
    }
    expect(() =>
      blogBodySchema.parse({ type: "doc", content: [node] }),
    ).toThrow();
  });
});

describe("blogSlugSchema", () => {
  it.each(["hello-world", "post2", "a-b-c"])("accepts %s", (slug) => {
    expect(blogSlugSchema.parse(slug)).toBe(slug);
  });

  it.each([
    "Hello World",
    "-leading",
    "trailing-",
    "double--hyphen",
    "under_score",
    "",
  ])("rejects %s", (slug) => {
    expect(() => blogSlugSchema.parse(slug)).toThrow();
  });
});

describe("blogTagsSchema", () => {
  it("dedupes case-insensitively, keeping the first spelling", () => {
    expect(blogTagsSchema.parse(["React", "react", "TypeScript"])).toEqual([
      "React",
      "TypeScript",
    ]);
  });
});

describe("updateBlogPostSchema", () => {
  it("has no readingMinutes or publishedAt field", () => {
    // Derived values are absent by construction, not merely ignored: a field a
    // client cannot send is a field that cannot drift from the content.
    const parsed = updateBlogPostSchema.parse({
      title: "T",
      readingMinutes: 99,
      publishedAt: new Date().toISOString(),
    });
    expect(parsed).not.toHaveProperty("readingMinutes");
    expect(parsed).not.toHaveProperty("publishedAt");
  });
});
