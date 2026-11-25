import { cn } from "@/lib/utils";

/**
 * Zee Telephonics mark, drawn to match the website logo: a round "ZT" badge inside an
 * orbit ring with three markers and a cyan signal dot.
 */
export function LogoMark({ className, tone = "auto" }: { className?: string; tone?: "auto" | "light" }) {
  const ring = tone === "light" ? "#ffffff" : "currentColor";
  return (
    <svg viewBox="0 0 48 48" className={cn(tone === "auto" && "text-navy dark:text-white", className)} aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="22" fill="none" stroke={ring} strokeOpacity="0.85" strokeWidth="1.6" />
      <path d="M24 0.8v4.2M0.8 24h4.2M43 24h4.2" stroke={ring} strokeOpacity="0.85" strokeWidth="1.6" />
      <circle cx="24" cy="24" r="16.5" fill={ring} />
      <text
        x="24"
        y="29.2"
        textAnchor="middle"
        fontFamily="var(--font-display), Segoe UI, sans-serif"
        fontWeight="700"
        fontSize="14.5"
        letterSpacing="-0.5"
        className={tone === "light" ? "fill-navy" : "fill-white dark:fill-navy"}
      >
        ZT
      </text>
      <circle cx="39.6" cy="39.6" r="4" fill="#00D4FF" stroke={tone === "light" ? "#0A1630" : "var(--surface)"} strokeWidth="1.4" />
    </svg>
  );
}

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-display font-bold", className)}>
      <LogoMark className="size-10 shrink-0" tone={inverted ? "light" : "auto"} />
      <span className="text-[1.05rem] leading-none tracking-[0.04em]">
        <span className={inverted ? "text-white" : "text-navy dark:text-white"}>ZEE</span>{" "}
        <span className={inverted ? "text-brand-cyan" : "text-brand-cyan-700 dark:text-brand-cyan"}>TELEPHONICS</span>
        <span className="mt-1 block text-[0.62rem] font-semibold tracking-[0.2em] text-muted">CRM</span>
      </span>
    </span>
  );
}
