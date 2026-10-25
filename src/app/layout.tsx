import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { Toaster } from "sonner";
import { siteUrl } from "@/lib/utils";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  weight: ["600", "700", "800"],
});

const STORE_NAME = "The Boamah's Online Grocery Shop";
const DESCRIPTION =
  "Shop fresh produce, pantry essentials, drinks and household groceries online from The Boamah's Online Grocery Shop in Ghana.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${STORE_NAME} | Fresh groceries delivered`, template: `%s | ${STORE_NAME}` },
  description: DESCRIPTION,
  applicationName: STORE_NAME,
  openGraph: {
    type: "website",
    siteName: STORE_NAME,
    locale: "en_GH",
    title: STORE_NAME,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#174d33",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GH" className={`${inter.variable} ${manrope.variable}`}>
      <body>
        {children}
        <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 4000 }} />
      </body>
    </html>
  );
}
