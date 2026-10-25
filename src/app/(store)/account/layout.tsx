import Link from "next/link";
import { Heart, LayoutDashboard, MapPin, Package, Settings, UserRound } from "lucide-react";
import { SignOutButton } from "@/components/account/account-forms";
import { requireUser } from "@/server/session";

const LINKS = [
  { href: "/account", label: "Overview", Icon: UserRound },
  { href: "/account/orders", label: "Orders", Icon: Package },
  { href: "/account/addresses", label: "Addresses", Icon: MapPin },
  { href: "/account/wishlist", label: "Wishlist", Icon: Heart },
  { href: "/account/settings", label: "Password & security", Icon: Settings },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/account");
  return (
    <div className="container-page grid gap-8 pt-8 lg:grid-cols-[240px_1fr]">
      <aside>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="truncate font-semibold text-ink">{user.name}</p>
          <p className="truncate text-sm text-ink-muted">{user.email}</p>
          <nav aria-label="Account" className="mt-4 flex gap-1 overflow-x-auto scrollbar-none lg:flex-col">
            {LINKS.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink-muted hover:bg-soft hover:text-ink"
              >
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
              </Link>
            ))}
            {user.isStaff ? (
              <Link href="/admin" className="flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Admin dashboard
              </Link>
            ) : null}
          </nav>
          <SignOutButton className="mt-4 w-full" />
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
