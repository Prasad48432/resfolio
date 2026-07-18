"use client";

import type { Editor } from "@tiptap/react";
import {
  Button,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@resfolio/ui";
import {
  Bold,
  Code,
  Code2,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Strikethrough,
  Underline,
  Info,
} from "lucide-react";
import { useCallback, type ReactNode } from "react";

/**
 * The formatting toolbar.
 *
 * Sticky rather than floating: a bubble menu that appears on selection is
 * charming until you want a heading on an empty line, and then it is nowhere.
 * A fixed bar is always in the same place, which is what makes it fast to use
 * without looking.
 *
 * Every control is also a keyboard shortcut, shown in its tooltip — the toolbar
 * is the discoverable path to a shortcut, not the intended one. Buttons use
 * `onMouseDown` + `preventDefault` so clicking one never steals focus from the
 * document; losing the selection on the way to a format button would make the
 * button unable to do its job.
 */

function ToolButton({
  onClick,
  active,
  disabled,
  label,
  shortcut,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  shortcut?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          onMouseDown={(event) => {
            event.preventDefault();
            onClick();
          }}
          className={cn(
            "size-8 rounded-md text-muted transition-colors duration-150",
            "hover:bg-accent hover:text-foreground",
            active && "bg-accent text-foreground",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {shortcut ? <span className="ml-2 opacity-60">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** ⌘ on Apple platforms, Ctrl everywhere else — read once at render. */
function modKey(): string {
  if (typeof navigator === "undefined") {
    return "Ctrl";
  }
  return /Mac|iPhone|iPad/u.test(navigator.platform) ? "⌘" : "Ctrl";
}

export function EditorToolbar({
  editor,
  onInsertImage,
  imageDisabled,
  imageDisabledReason,
}: {
  editor: Editor;
  onInsertImage: () => void;
  imageDisabled?: boolean;
  imageDisabledReason?: string;
}) {
  const mod = modKey();

  /**
   * Links are the one control that needs input. `window.prompt` is unglamorous
   * but it is instant, keyboard-native, and cannot lose the selection — a
   * custom popover here would need to hold the selection open while an input
   * takes focus, which is a real source of bugs for a control used this often.
   */
  const setLink = useCallback(() => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const input = window.prompt("Link URL", previous ?? "https://");
    if (input === null) {
      return;
    }
    if (input.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: input.trim() })
      .run();
  }, [editor]);

  return (
    <div
      className={cn(
        "sticky top-0 z-10 -mx-2 flex flex-wrap items-center gap-0.5 px-2 py-1.5",
        "border-b border-border bg-background/85 backdrop-blur-sm",
      )}
      role="toolbar"
      aria-label="Formatting"
    >
      <ToolButton
        label="Heading"
        shortcut={`${mod}⌥2`}
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" />
      </ToolButton>
      <ToolButton
        label="Subheading"
        shortcut={`${mod}⌥3`}
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="size-4" />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolButton
        label="Bold"
        shortcut={`${mod}B`}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </ToolButton>
      <ToolButton
        label="Italic"
        shortcut={`${mod}I`}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </ToolButton>
      <ToolButton
        label="Underline"
        shortcut={`${mod}U`}
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline className="size-4" />
      </ToolButton>
      <ToolButton
        label="Strikethrough"
        shortcut={`${mod}⇧S`}
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-4" />
      </ToolButton>
      <ToolButton
        label="Inline code"
        shortcut={`${mod}E`}
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="size-4" />
      </ToolButton>
      <ToolButton
        label="Link"
        shortcut={`${mod}K`}
        active={editor.isActive("link")}
        onClick={setLink}
      >
        <Link2 className="size-4" />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolButton
        label="Bullet list"
        shortcut={`${mod}⇧8`}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </ToolButton>
      <ToolButton
        label="Numbered list"
        shortcut={`${mod}⇧7`}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </ToolButton>
      <ToolButton
        label="Task list"
        shortcut={`${mod}⇧9`}
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListTodo className="size-4" />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolButton
        label="Quote"
        shortcut={`${mod}⇧B`}
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-4" />
      </ToolButton>
      <ToolButton
        label="Callout"
        shortcut={`${mod}⇧C`}
        active={editor.isActive("callout")}
        onClick={() => editor.chain().focus().toggleCallout().run()}
      >
        <Info className="size-4" />
      </ToolButton>
      <ToolButton
        label="Code block"
        shortcut={`${mod}⌥C`}
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 className="size-4" />
      </ToolButton>
      <ToolButton
        label="Divider"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus className="size-4" />
      </ToolButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ToolButton
        label={
          imageDisabled
            ? (imageDisabledReason ?? "Image limit reached")
            : "Insert image"
        }
        disabled={imageDisabled}
        onClick={onInsertImage}
      >
        <ImagePlus className="size-4" />
      </ToolButton>
    </div>
  );
}
