"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Monitor, Moon, Search, Sun } from "lucide-react";
import { initials } from "@/lib/crm/people";
import { setThemeAction } from "@/app/crm/(app)/account/actions";

export type ThemeChoice = "light" | "dark" | "system";

export function SearchBox() {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      className="crm-glass order-last flex h-12 w-full min-w-0 items-center gap-3 rounded-2xl px-4 shadow-soft sm:order-none sm:w-auto sm:flex-1 md:max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const q = ref.current?.value.trim();
        if (q) router.push(`/crm/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <Search className="size-4 shrink-0 text-muted" aria-hidden />
      <label htmlFor="crm-search" className="sr-only">
        Search the CRM
      </label>
      <input id="crm-search" ref={ref} name="q" placeholder="Search leads, contacts, people..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" />
      <kbd className="hidden rounded-md border border-border bg-surface/70 px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:inline">Ctrl K</kbd>
    </form>
  );
}

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };

/** Cycles system, light and dark, pinning the choice on the CRM shell. */
export function ThemeToggle({ initial }: { initial: ThemeChoice }) {
  const [theme, setTheme] = useState<ThemeChoice>(initial);
  const [, startTransition] = useTransition();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <button
      type="button"
      className="grid size-10 place-items-center rounded-full text-foreground hover:bg-white/60 dark:hover:bg-white/10"
      aria-label={`Theme: ${theme}. Switch to ${NEXT[theme]}`}
      title={`Theme: ${theme}`}
      onClick={() => {
        const next = NEXT[theme];
        setTheme(next);
        const shell = document.getElementById("crm-shell");
        if (shell) {
          if (next === "system") shell.removeAttribute("data-theme");
          else shell.setAttribute("data-theme", next);
        }
        startTransition(() => setThemeAction(next));
      }}
    >
      <Icon className="size-5" aria-hidden strokeWidth={1.8} />
    </button>
  );
}

export function UserChip({ name, role }: { name: string; role: string }) {
  return (
    <Link href="/crm/account" className="flex items-center gap-2.5 rounded-full py-1 pr-2 pl-1 hover:bg-white/60 dark:hover:bg-white/10">
      <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand-cyan to-brand-blue text-xs font-bold text-white">{initials(name || "?")}</span>
      <span className="hidden text-left leading-tight lg:block">
        <span className="block text-sm font-semibold">{name || "New team member"}</span>
        <span className="block text-xs text-muted">{role || "No role yet"}</span>
      </span>
    </Link>
  );
}
