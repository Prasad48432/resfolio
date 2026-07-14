import {
  FileText,
  Globe,
  Link2,
  Settings,
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
  { key: "resumes", label: "Resumes", href: "/resumes", icon: FileText },
  { key: "portfolio", label: "Portfolio", href: "/portfolio", icon: Globe },
  { key: "domains", label: "Domains", href: "/domains", icon: Link2 },
  {
    key: "settings",
    label: "Settings",
    href: "/settings/account",
    icon: Settings,
  },
];

export function sectionLabelFor(pathname: string): string {
  const item = NAV_ITEMS.find(
    (candidate) =>
      pathname === candidate.href || pathname.startsWith(`/${candidate.key}`),
  );
  return item?.label ?? "Dashboard";
}
