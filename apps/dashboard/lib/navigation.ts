import {
  FileText,
  Globe,
  Link2,
  PenLine,
  Plug,
  Settings,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";

/**
 * The IA from docs/architecture/08-dashboard-ux.md — the Profile is the
 * center of the product, so it is the center (and default route) of the nav.
 * Consumed by the sidebar and the command palette so the two never drift.
 */
export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Set while the feature's phase is still ahead of us. */
  comingInPhase?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "profile", label: "Profile", href: "/profile", icon: UserRound },
  // Directly under Profile, because that is what it acts on. Resfolio AI is an
  // action layer over the profile, not a separate product bolted beside it, and
  // parking it at the bottom of the list would say the opposite (doc 13).
  { key: "ai", label: "Resfolio AI", href: "/ai", icon: Sparkles },
  { key: "resumes", label: "Resumes", href: "/resumes", icon: FileText },
  { key: "portfolio", label: "Portfolio", href: "/portfolio", icon: Globe },
  {
    key: "blog",
    label: "Blog",
    href: "/blog",
    icon: PenLine,
    comingInPhase: 8,
  },
  { key: "sources", label: "Sources", href: "/sources", icon: Plug },
  { key: "domains", label: "Domains", href: "/domains", icon: Link2 },
  {
    key: "settings",
    label: "Settings",
    href: "/settings/account",
    icon: Settings,
  },
];

/**
 * Destinations that are reachable and searchable but do not earn a sidebar row.
 *
 * The sidebar is the product's shape: eight rows that are each a place you work.
 *
 * **Job match stopped being a destination in Phase 7.** It used to be `/ai/job`,
 * listed here so `cmd+k` could find a route with no sidebar row. It is now a
 * thing that happens *inside* a conversation — you paste a posting into `/ai` and
 * the match appears in the transcript — so there is nothing to navigate to, and
 * an entry that pointed at `/ai` under a second name would be one destination
 * wearing two labels in the same list.
 *
 * The list is deliberately kept (empty) rather than deleted: the palette's
 * `NAV_ITEMS + extras` composition is the shape, and the next tool-with-a-URL
 * belongs here rather than in a component.
 */
export const PALETTE_EXTRA_ITEMS: NavItem[] = [];

/** Everything `cmd+k` can navigate to, in sidebar order with the extras last. */
export const PALETTE_ITEMS: NavItem[] = [...NAV_ITEMS, ...PALETTE_EXTRA_ITEMS];

export function sectionLabelFor(pathname: string): string {
  const item = NAV_ITEMS.find(
    (candidate) =>
      pathname === candidate.href || pathname.startsWith(`/${candidate.key}`),
  );
  return item?.label ?? "Dashboard";
}
