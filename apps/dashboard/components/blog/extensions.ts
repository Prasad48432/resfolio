import { Node, mergeAttributes } from "@tiptap/core";

import { CALLOUT_TONES, type CalloutTone } from "@resfolio/blog";

/**
 * The editor-side half of the body contract.
 *
 * Every node defined here has a counterpart in `@resfolio/blog`'s
 * `blogBodySchema`, and the **names and attribute shapes must match exactly** —
 * the editor's `getJSON()` output is stored verbatim after that schema
 * validates it. A rename on one side without the other produces a document
 * that saves cleanly in the editor and is rejected by the server, which is the
 * confusing direction of that failure. The domain schema is the authority;
 * this file conforms to it.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blogImage: {
      setBlogImage: (attrs: {
        assetKey: string;
        src: string;
        alt?: string;
        caption?: string;
        width?: number | null;
        height?: number | null;
      }) => ReturnType;
      setImageCaption: (caption: string) => ReturnType;
    };
    callout: {
      toggleCallout: (tone?: CalloutTone) => ReturnType;
    };
  }
}

/**
 * An embedded image.
 *
 * A **block** node with `atom: false` semantics handled manually: the caption
 * is an attribute rather than child content, so the schema stays flat and a
 * caption can never accidentally hold another image.
 *
 * `assetKey` is the field that matters — it is what image cleanup counts. It is
 * rendered into a `data-asset-key` attribute so a copy-paste between two posts
 * carries the key with it, which is what makes the same image in two posts
 * resolve to one stored object rather than a re-upload.
 */
export const BlogImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      assetKey: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-asset-key") ?? "",
        renderHTML: (attributes) => ({
          "data-asset-key": attributes.assetKey as string,
        }),
      },
      src: { default: "" },
      alt: { default: "" },
      caption: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-caption") ?? "",
        renderHTML: (attributes) => ({
          "data-caption": attributes.caption as string,
        }),
      },
      width: { default: null },
      height: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },

  addCommands() {
    return {
      setBlogImage:
        (attrs) =>
        ({ commands }) =>
          // Inserted at the cursor rather than appended — the requirement was
          // explicit, and it is also the only behaviour that makes pasting an
          // image mid-paragraph feel like the editor understood you.
          commands.insertContent({ type: this.name, attrs }),
      setImageCaption:
        (caption) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { caption }),
    };
  },
});

/**
 * A callout — an aside the reader should not skim past.
 *
 * Content is `block+` rather than inline so a callout can hold a list or a
 * second paragraph, which is what people actually put in them. The tone is a
 * closed set (`CALLOUT_TONES`) so a template can style each one deliberately
 * instead of being handed an arbitrary colour.
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: "info" satisfies CalloutTone,
        parseHTML: (element) => element.getAttribute("data-tone") ?? "info",
        renderHTML: (attributes) => ({
          "data-tone": attributes.tone as string,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "" }), 0];
  },

  addCommands() {
    return {
      toggleCallout:
        (tone = "info") =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { tone }),
    };
  },

  addKeyboardShortcuts() {
    return {
      // Mirrors the blockquote shortcut's shape, one key over.
      "Mod-Shift-c": () => this.editor.commands.toggleCallout(),
    };
  },
});

export const CALLOUT_TONE_OPTIONS = CALLOUT_TONES;
