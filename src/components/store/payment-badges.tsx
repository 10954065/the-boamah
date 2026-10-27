import { Banknote, CreditCard, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaymentOptions {
  /** Online payment (Paystack) is set up and switched on. */
  online: boolean;
  cod: boolean;
}

interface PaymentBadgesProps extends PaymentOptions {
  tone?: "light" | "dark";
  label?: string;
  className?: string;
}

// Plain text chips with a colour dot, not the networks' official logos.
const MOBILE_MONEY = [
  { name: "MTN MoMo", dot: "#ffcb05" },
  { name: "Telecel Cash", dot: "#e4002b" },
  { name: "AirtelTigo Money", dot: "#1d4f91" },
];

/** The ways a customer can pay, taken from the store's payment settings. */
export function PaymentBadges({ online, cod, tone = "light", label = "We accept", className }: PaymentBadgesProps) {
  if (!online && !cod) return null;
  const chip = cn(
    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold leading-none",
    tone === "dark" ? "bg-white/10 text-brand-50 ring-1 ring-white/15" : "bg-surface text-ink ring-1 ring-line",
  );
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className={cn("mr-0.5 text-xs", tone === "dark" ? "text-brand-300" : "text-ink-muted")}>{label}</span>
      <ul className="contents">
        {online
          ? MOBILE_MONEY.map((network) => (
              <li key={network.name} className={chip}>
                <Smartphone className="h-3 w-3 opacity-70" aria-hidden="true" />
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: network.dot }} aria-hidden="true" />
                {network.name}
              </li>
            ))
          : null}
        {online ? (
          <li className={chip}>
            <CreditCard className="h-3 w-3 opacity-70" aria-hidden="true" /> Visa / Mastercard
          </li>
        ) : null}
        {cod ? (
          <li className={chip}>
            <Banknote className="h-3 w-3 opacity-70" aria-hidden="true" /> Cash on delivery
          </li>
        ) : null}
      </ul>
    </div>
  );
}
