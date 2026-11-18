import {
  LayoutDashboard,
  Building2,
  CalendarCheck,
  Users,
  Wallet,
  Layers,
  ShieldCheck,
  Headset,
  Lightbulb,
  Mail,
  Flag,
  Star,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Phase this section ships in. Compared against BUILT_THROUGH_PHASE. */
  phase: 1 | 2 | 3 | 4 | 5;
};

/** Bump this as each phase ships — drives the sidebar's "Phase N" tags. */
export const BUILT_THROUGH_PHASE = 5;

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, phase: 1 },
  { label: "Venues", href: "/venues", icon: Building2, phase: 2 },
  { label: "Bookings", href: "/bookings", icon: CalendarCheck, phase: 3 },
  { label: "Users", href: "/users", icon: Users, phase: 3 },
  { label: "Support", href: "/support", icon: Headset, phase: 3 },
  { label: "Contact Inbox", href: "/inbox", icon: Mail, phase: 3 },
  { label: "Reports", href: "/reports", icon: Flag, phase: 3 },
  { label: "Reviews", href: "/reviews", icon: Star, phase: 3 },
  { label: "Suggestions", href: "/suggestions", icon: Lightbulb, phase: 3 },
  { label: "Payments", href: "/payments", icon: Wallet, phase: 4 },
  { label: "Content", href: "/content", icon: Layers, phase: 5 },
  { label: "Audit Log", href: "/audit", icon: ScrollText, phase: 5 },
  { label: "Roles & Access", href: "/roles", icon: ShieldCheck, phase: 5 },
];
