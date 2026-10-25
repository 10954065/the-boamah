import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoMarkProps {
  className?: string;
  title?: string;
}

/** Basket-and-leaf mark. Stays legible down to 16px. */
export function LogoMark({ className, title }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("h-9 w-9 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <rect width="40" height="40" rx="10" fill="#174d33" />
      <path d="M12.5 17.5a7.5 7.5 0 0 1 15 0" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M8.5 17.5h23l-2.5 11.6a3 3 0 0 1-2.93 2.37H13.93A3 3 0 0 1 11 29.1L8.5 17.5z" fill="#fff" />
      <path d="M15 22v5.5M20 22v5.5M25 22v5.5" stroke="#174d33" strokeWidth="2" strokeLinecap="round" />
      <path d="M22.5 12.6c.2-4.1 3.3-6.4 7.8-6.3-.2 4.2-3.3 6.5-7.8 6.3z" fill="#7cbc4b" />
    </svg>
  );
}

interface LogoProps {
  href?: string;
  className?: string;
  tone?: "dark" | "light";
  compact?: boolean;
}

/** Typographic brand lock-up: mark + "The Boamah's" / "Online Grocery Shop". */
export function Logo({ href = "/", className, tone = "dark", compact = false }: LogoProps) {
  return (
    <Link href={href} aria-label="The Boamah's Online Grocery Shop home page" className="rounded-md">
      <span className={cn("inline-flex items-center gap-2.5", className)}>
        <LogoMark />
        <span className={cn("flex flex-col leading-none", compact && "max-sm:hidden")}>
          <span
            className={cn(
              "font-display text-[19px] font-extrabold tracking-[-0.02em]",
              tone === "dark" ? "text-brand-800" : "text-white",
            )}
          >
            The Boamah&rsquo;s
          </span>
          <span
            className={cn(
              "mt-1 text-[9.5px] font-semibold uppercase tracking-[0.2em]",
              tone === "dark" ? "text-leaf-600" : "text-brand-100",
            )}
          >
            Online Grocery Shop
          </span>
        </span>
      </span>
    </Link>
  );
}
