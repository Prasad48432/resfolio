import { z } from "zod";

/**
 * The post body contract: a **ProseMirror/TipTap document** over an explicit
 * node and mark whitelist.
 *
 * ## Why this is not the profile's rich text
 *
 * `@resfolio/profile`'s `richTextSchema` is a deliberately tiny Markdown subset
 * — bold, italic, links, hyphen lists — chosen so a resume survives plain-text
 * ATS extraction and JSON Resume export (doc 01). A post needs headings, code
 * blocks, task lists, images with captions and callouts. None of those are
 * expressible in that grammar, and widening it would widen it for resumes too,
 * where the constraint is the point. Two content shapes, each matched to what
 * reads it.
 *
 * ## Why a whitelist rather than sanitised HTML
 *
 * The profile schema rejects raw HTML with a regex, because its content is a
 * string and a string can contain anything. Here, HTML is not *representable*:
 * a node is only valid if its `type` is in this table, and there is no node
 * type that carries markup. A `<script>` in a post is not blocked — it has
 * nowhere to live. That is the same reasoning as `ACCEPTED_IMAGE_TYPES`
 * excluding SVG (doc 07): make the dangerous thing unrepresentable rather than
 * filtered.
 *
 * Everything here is pure and framework-free — no TipTap import. The editor
 * happens to produce this shape; the contract does not depend on the editor,
 * so a body written by an importer or a migration is validated identically.
 */

/**
 * Link schemes we allow, matching the profile engine's rule exactly (doc 10).
 * `javascript:` and `data:` are the reason this is an allowlist rather than a
 * blocklist — a link is the one place in a post where a user supplies a URL
 * that a reader's browser will follow.
 */
const SAFE_LINK_SCHEMES = ["http:", "https:", "mailto:"] as const;

function isSafeLinkHref(value: string): boolean {
  try {
    return (SAFE_LINK_SCHEMES as readonly string[]).includes(
      new URL(value).protocol,
    );
  } catch {
    return false;
  }
}

const linkHrefSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(isSafeLinkHref, {
    message: "Links must be full http(s) or mailto URLs.",
  });

/** Inline formatting. `underline` is included because writers expect it even
 * though semantic HTML discourages it; the renderer maps it to a styled span,
 * not `<u>`. */
export const blogMarkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }),
  z.object({ type: z.literal("italic") }),
  z.object({ type: z.literal("underline") }),
  z.object({ type: z.literal("strike") }),
  z.object({ type: z.literal("code") }),
  z.object({
    type: z.literal("link"),
    attrs: z.object({
      href: linkHrefSchema,
      target: z.enum(["_blank", "_self"]).nullish(),
    }),
  }),
]);
export type BlogMark = z.infer<typeof blogMarkSchema>;

/** Callout tones. A closed set so templates can style each one deliberately
 * rather than being handed an arbitrary colour. */
export const CALLOUT_TONES = ["info", "success", "warning", "danger"] as const;
export const calloutToneSchema = z.enum(CALLOUT_TONES);
export type CalloutTone = z.infer<typeof calloutToneSchema>;

export const HEADING_LEVELS = [1, 2, 3] as const;

/**
 * Every node type a body may contain.
 *
 * Written as a lazy recursive schema because block nodes nest arbitrarily
 * (a list inside a blockquote inside a callout). The depth guard below is what
 * keeps that from being a denial-of-service surface.
 */
export type BlogNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: BlogNode[];
  marks?: BlogMark[];
  text?: string;
};

const textNodeSchema = z.object({
  type: z.literal("text"),
  text: z.string().max(10_000),
  marks: z.array(blogMarkSchema).max(8).optional(),
});

const hardBreakSchema = z.object({ type: z.literal("hardBreak") });

const horizontalRuleSchema = z.object({ type: z.literal("horizontalRule") });

/**
 * An embedded image.
 *
 * `assetKey` is the R2 object key and is the field that matters: it is what
 * `collectBodyAssetKeys` counts for cleanup, and what survives the delivery
 * origin moving. `src` is a *cache* of the resolved URL so a body can render
 * without a lookup — if the two ever disagree, the key wins, and the renderer
 * re-resolves. Storing only the URL would make cleanup a string-parse against
 * a hostname that is expected to change (doc 07).
 */
const imageNodeSchema = z.object({
  type: z.literal("image"),
  attrs: z.object({
    assetKey: z.string().trim().min(1).max(512),
    src: z.string().trim().min(1).max(2048),
    alt: z.string().trim().max(500).default(""),
    /** Rendered as a `<figcaption>`; empty means a bare `<img>`. */
    caption: z.string().trim().max(500).default(""),
    width: z.number().int().positive().max(10_000).nullish(),
    height: z.number().int().positive().max(10_000).nullish(),
  }),
});

const codeBlockSchema: z.ZodType<BlogNode> = z.object({
  type: z.literal("codeBlock"),
  attrs: z
    .object({
      /** Free text rather than an enum of languages: the highlighter owns that
       * list, and an unknown language should render as plain code, not fail
       * validation and lose the user's post. */
      language: z.string().trim().max(40).nullish(),
    })
    .optional(),
  content: z.array(textNodeSchema).max(2000).optional(),
});

/** Assembled lazily so the recursive block types can reference each other. */
const blockNodeSchema: z.ZodType<BlogNode> = z.lazy(() =>
  z.union([
    paragraphSchema,
    headingSchema,
    codeBlockSchema,
    blockquoteSchema,
    bulletListSchema,
    orderedListSchema,
    taskListSchema,
    calloutSchema,
    imageNodeSchema,
    horizontalRuleSchema,
  ]),
) as z.ZodType<BlogNode>;

const inlineContentSchema = z
  .array(z.union([textNodeSchema, hardBreakSchema, imageNodeSchema]))
  .max(5000);

const paragraphSchema: z.ZodType<BlogNode> = z.object({
  type: z.literal("paragraph"),
  content: inlineContentSchema.optional(),
});

const headingSchema: z.ZodType<BlogNode> = z.object({
  type: z.literal("heading"),
  attrs: z.object({
    // H1 is the post title, rendered by the page, not the body — so a body
    // heading starts at 2 in practice. Level 1 stays valid because pasted
    // content contains it and demoting silently is worse than allowing it.
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
  content: inlineContentSchema.optional(),
});

const blockquoteSchema: z.ZodType<BlogNode> = z.lazy(() =>
  z.object({
    type: z.literal("blockquote"),
    content: z.array(blockNodeSchema).max(200).optional(),
  }),
) as z.ZodType<BlogNode>;

const listItemSchema: z.ZodType<BlogNode> = z.lazy(() =>
  z.object({
    type: z.literal("listItem"),
    content: z.array(blockNodeSchema).max(200).optional(),
  }),
) as z.ZodType<BlogNode>;

const bulletListSchema: z.ZodType<BlogNode> = z.lazy(() =>
  z.object({
    type: z.literal("bulletList"),
    content: z.array(listItemSchema).max(500).optional(),
  }),
) as z.ZodType<BlogNode>;

const orderedListSchema: z.ZodType<BlogNode> = z.lazy(() =>
  z.object({
    type: z.literal("orderedList"),
    attrs: z
      .object({ start: z.number().int().min(1).max(10_000).default(1) })
      .optional(),
    content: z.array(listItemSchema).max(500).optional(),
  }),
) as z.ZodType<BlogNode>;

const taskItemSchema: z.ZodType<BlogNode> = z.lazy(() =>
  z.object({
    type: z.literal("taskItem"),
    attrs: z.object({ checked: z.boolean().default(false) }),
    content: z.array(blockNodeSchema).max(200).optional(),
  }),
) as z.ZodType<BlogNode>;

const taskListSchema: z.ZodType<BlogNode> = z.lazy(() =>
  z.object({
    type: z.literal("taskList"),
    content: z.array(taskItemSchema).max(500).optional(),
  }),
) as z.ZodType<BlogNode>;

const calloutSchema: z.ZodType<BlogNode> = z.lazy(() =>
  z.object({
    type: z.literal("callout"),
    attrs: z.object({ tone: calloutToneSchema.default("info") }),
    content: z.array(blockNodeSchema).max(200).optional(),
  }),
) as z.ZodType<BlogNode>;

/**
 * Maximum nesting depth.
 *
 * Recursion in the schema means a hostile (or merely pathological, e.g. pasted
 * from a deeply-nested outline) document could nest thousands of levels deep,
 * and both validation and rendering recurse over it. Bounding depth turns that
 * from a stack overflow into a validation error. 24 is far past anything real
 * prose reaches — a list inside a quote inside a callout is depth 4.
 */
export const MAX_BODY_DEPTH = 24;

function depthOf(node: BlogNode, depth = 1): number {
  if (!node.content || node.content.length === 0) {
    return depth;
  }
  let deepest = depth;
  for (const child of node.content) {
    const childDepth = depthOf(child, depth + 1);
    if (childDepth > deepest) {
      deepest = childDepth;
    }
  }
  return deepest;
}

/** The whole post body. */
export const blogBodySchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(blockNodeSchema).max(5000).default([]),
  })
  .refine((doc) => depthOf(doc as BlogNode) <= MAX_BODY_DEPTH, {
    message: "This content is nested too deeply.",
  });

export type BlogBody = z.infer<typeof blogBodySchema>;

/** An empty document — what a brand-new post starts as. */
export function emptyBlogBody(): BlogBody {
  return { type: "doc", content: [] };
}
