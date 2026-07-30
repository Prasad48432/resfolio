import {
  Briefcase,
  FileText,
  Gauge,
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
  // Immediately after the AI, because it is the other half of the same
  // workflow: a posting analysed in a conversation is already a row here, and
  // the tracker is where that row goes on living once the chat is over. Note
  // `key` must equal the first URL segment — the sidebar's active state and the
  // top bar's title both match on `/${key}`.
  { key: "jobs", label: "Job Tracker", href: "/jobs", icon: Briefcase },
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
 * **AI usage is the first real entry** (doc 14 §13), and it is exactly the case
 * this list was kept for: a destination people go looking for by name — "how much
 * have I used" — that does not earn a permanent row beside the Profile. Settings
 * already has a sidebar row, and its own sub-nav is how you find this by browsing;
 * this is how you find it by typing.
 */
export const PALETTE_EXTRA_ITEMS: NavItem[] = [
  {
    // `key` must equal the first URL segment (`sectionLabelFor` and the sidebar's
    // active state both match on `/${key}`), so this correctly lights the Settings
    // row and titles the top bar "Settings" rather than inventing a ninth section.
    key: "settings",
    label: "AI usage",
    href: "/settings/ai-usage",
    icon: Gauge,
  },
];

/** Everything `cmd+k` can navigate to, in sidebar order with the extras last. */
export const PALETTE_ITEMS: NavItem[] = [...NAV_ITEMS, ...PALETTE_EXTRA_ITEMS];

export function sectionLabelFor(pathname: string): string {
  const item = NAV_ITEMS.find(
    (candidate) =>
      pathname === candidate.href || pathname.startsWith(`/${candidate.key}`),
  );
  return item?.label ?? "Dashboard";
}
