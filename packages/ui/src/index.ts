/**
 * @resfolio/ui — shared UI primitives, themed by @resfolio/design tokens.
 *
 * This file is the package's public API: apps import from "@resfolio/ui"
 * only, never from internal paths (see root CLAUDE.md → Imports).
 *
 * Primitives follow the shadcn/ui pattern (cva variants + Radix where a
 * behavior needs it) and are added as features need them — not speculatively.
 * Some are hand-authored to that pattern; the rest come from the registry via
 * `pnpm dlx shadcn@latest add … -c packages/ui` and are themed by the token
 * bridge (`@resfolio/design/shadcn`) rather than by editing them. See
 * packages/ui/CLAUDE.md before adding more.
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./components/select";
export { TagInput } from "./components/tag-input";
export { Checkbox } from "./components/checkbox";
export { Switch } from "./components/switch";
export {
  Card,
  CardAction,
  cardVariants,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./components/card";
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
  MonthYearPicker,
  formatMonthYear,
  type MonthYearPickerProps,
} from "./components/month-year-picker";
export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "./components/popover";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/dropdown-menu";
export { Separator } from "./components/separator";
export { Skeleton } from "./components/skeleton";
export {
  Spinner,
  spinnerVariants,
  type SpinnerProps,
} from "./components/spinner";
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./components/sheet";
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/tooltip";
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./components/sidebar";
export { useIsMobile } from "./hooks/use-mobile";
