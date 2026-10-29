import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Till", template: "%s | Till | The Boamah's" },
  robots: { index: false, follow: false },
};

/** The in-shop till: its own full-screen shell, without the shop's header and footer. */
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-soft text-ink">{children}</div>;
}
