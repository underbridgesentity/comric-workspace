"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldAlert,
  Radar,
  Crosshair,
  BellRing,
  Search,
  FlaskConical,
  BarChart3,
  FileText,
  Archive,
  FolderLock,
  Users,
  ScrollText,
} from "lucide-react";
import { ROLE_LABELS } from "@/lib/permissions";
import { ComricLogo } from "@/components/logo";
import type { Role } from "@/lib/schema";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: Role[];
};

type NavGroup = { label: string; items: NavItem[] };

const iconCls = "h-4 w-4";

function navGroups(role: Role): NavGroup[] {
  const groups: NavGroup[] = [
    {
      label: "OVERVIEW",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className={iconCls} /> },
        { href: "/alerts", label: "Alerts", icon: <BellRing className={iconCls} /> },
      ],
    },
    {
      label: "MODULES",
      items: [
        { href: "/risks", label: "Risk Register", icon: <ShieldAlert className={iconCls} /> },
        { href: "/intelligence", label: "Sector Intelligence", icon: <Radar className={iconCls} /> },
        { href: "/monitoring", label: "Risk Monitoring", icon: <Crosshair className={iconCls} /> },
        { href: "/research/keywords", label: "Keyword Monitoring", icon: <Search className={iconCls} /> },
        { href: "/research", label: "Research Engine", icon: <FlaskConical className={iconCls} /> },
        { href: "/analytics", label: "Analytics", icon: <BarChart3 className={iconCls} /> },
        { href: "/reports", label: "Reports", icon: <FileText className={iconCls} /> },
        { href: "/archive", label: "Archive", icon: <Archive className={iconCls} /> },
        { href: "/documents", label: "Document Hub", icon: <FolderLock className={iconCls} /> },
      ],
    },
  ];

  if (role === "ceo" || role === "ops_manager") {
    groups.push({
      label: "ADMINISTRATION",
      items: [
        { href: "/users", label: "Users & Access", icon: <Users className={iconCls} /> },
        { href: "/activity", label: "Activity Log", icon: <ScrollText className={iconCls} /> },
      ],
    });
  }

  return groups;
}

export function Sidebar({
  user,
}: {
  user: { name: string; role: Role };
}) {
  const pathname = usePathname();
  const groups = navGroups(user.role);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-hairline bg-sidebar">
      <div className="flex h-16 items-center border-b border-hairline px-5">
        <Link href="/dashboard" className="flex items-baseline gap-2 text-ink select-none">
          <ComricLogo size={30} />
          <span className="font-display text-[9px] font-bold tracking-[0.25em] text-cyber">
            WORKSPACE
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-2 font-display text-[10px] font-bold tracking-[0.2em] text-muted">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/research" && item.href !== "/dashboard" && pathname.startsWith(item.href)) ||
                  (item.href === "/research" && pathname === "/research");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-brand px-2 py-1.5 text-sm transition-colors duration-150 ${
                        active
                          ? "bg-cyber/10 font-semibold text-cyber"
                          : "text-muted hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5"
                      }`}
                    >
                      <span className={active ? "text-cyber" : ""}>{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-cyber" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-hairline p-3">
        <div className="flex items-center gap-2.5 rounded-brand px-2 py-2">
          <div className="relative">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy font-display text-xs font-bold text-white">
              {user.name
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")}
            </div>
            <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-cyber" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xs font-bold text-ink">{user.name}</p>
            <p className="truncate text-[11px] text-muted">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
