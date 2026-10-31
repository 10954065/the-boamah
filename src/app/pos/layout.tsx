import type { Metadata } from "next";
import { TillDeviceHost } from "@/components/pos/onscreen-keyboard";
import { TillServiceWorker } from "@/components/pos/till-offline";

export const metadata: Metadata = {
  title: { default: "Till", template: "%s | Till | The Boamah's" },
  robots: { index: false, follow: false },
  // The till can be installed as an app on the counter PC or tablet.
  manifest: "/pos-manifest.webmanifest",
  appleWebApp: { capable: true, title: "Till", statusBarStyle: "black-translucent" },
};

/** The in-shop till: its own full-screen shell, without the shop's header and footer. */
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-soft text-ink">
      {children}
      <TillServiceWorker />
      <TillDeviceHost />
    </div>
  );
}
