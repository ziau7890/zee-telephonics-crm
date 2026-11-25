"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarClock,
  ChartColumn,
  Contact,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { LogoMark } from "@/components/ui/logo";
import type { NavItem } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/crm/(auth)/actions";

const ICONS = { Inbox, LayoutDashboard, Contact, CalendarClock, ChartColumn, Users, UserCog, ShieldCheck, ScrollText, Settings } as const;

function isActive(pathname: string, href: string) {
  return href === "/crm" ? pathname === "/crm" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ items, pathname, onNavigate, badges }: { items: NavItem[]; pathname: string; onNavigate?: () => void; badges: Record<string, number> }) {
  return (
    <nav aria-label="CRM" className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-1 [scrollbar-width:none]">
      {items.map((item) => {
        const Icon = ICONS[item.icon as keyof typeof ICONS] ?? LayoutDashboard;
        const active = isActive(pathname, item.href);
        const badge = badges[item.href] ?? 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-medium transition-all duration-200",
              active
                ? "bg-gradient-to-b from-brand-blue to-[#0091c2] text-white shadow-[0_10px_22px_-10px_rgb(30_94_255/0.9)]"
                : "text-muted hover:bg-white/60 hover:text-foreground dark:hover:bg-white/5",
            )}
          >
            <Icon className={cn("size-5", active ? "text-white" : "text-navy/80 dark:text-white/80")} aria-hidden strokeWidth={1.8} />
            <span className="w-full truncate text-center leading-tight">{item.label}</span>
            {badge ? (
              <span className="absolute top-1 right-2 grid min-w-4 place-items-center rounded-full bg-brand-cyan px-1 text-[10px] font-bold text-navy" aria-label={`${badge} due`}>
                {badge > 9 ? "9+" : badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function CrmSidebar({ items, badges = {} }: { items: NavItem[]; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const signOut = (
    <form action={signOutAction} className="px-2 pb-3">
      <button type="submit" className="flex w-full flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium text-danger hover:bg-danger-surface">
        <LogOut className="size-5" aria-hidden strokeWidth={1.8} />
        Sign out
      </button>
    </form>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="crm-glass fixed top-4 left-4 z-40 grid size-11 place-items-center rounded-2xl shadow-soft lg:hidden"
        aria-label="Open navigation"
        aria-expanded={open}
      >
        <Menu className="size-5" aria-hidden />
      </button>
      {open ? <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-hidden /> : null}
      <aside
        className={cn(
          "crm-glass fixed inset-y-3 left-3 z-50 flex w-[92px] flex-col rounded-[1.75rem] shadow-soft transition-transform duration-300 lg:sticky lg:top-3 lg:h-[calc(100dvh-1.5rem)] lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-[120%]",
        )}
      >
        <div className="flex items-center justify-center py-4">
          <Link href="/crm" aria-label="Zee Telephonics CRM home" className="rounded-xl p-1">
            <LogoMark className="size-10" />
          </Link>
          <button type="button" onClick={() => setOpen(false)} className="absolute top-2 right-2 rounded-lg p-1 lg:hidden" aria-label="Close navigation">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <NavLinks items={items} pathname={pathname} onNavigate={() => setOpen(false)} badges={badges} />
        {signOut}
      </aside>
    </>
  );
}
