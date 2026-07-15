/**
 * @resfolio/ui — shared UI primitives, themed by @resfolio/design tokens.
 *
 * This file is the package's public API: apps import from "@resfolio/ui"
 * only, never from internal paths (see root CLAUDE.md → Imports).
 *
 * Primitives follow the shadcn/ui pattern (cva variants + Radix where a
 * behavior needs it) and are added as features need them — not speculatively.
 *
 * Consuming apps must let Tailwind scan this package's source:
 *   `@source "../../../packages/ui/src";` in the app's globals.css.
 */
export { cn } from "./lib/cn";
export { Button, buttonVariants, type ButtonProps } from "./components/button";
export { Input } from "./components/input";
export { Textarea } from "./components/textarea";
export { Label } from "./components/label";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./components/dialog";
export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "./components/command";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/dropdown-menu";
