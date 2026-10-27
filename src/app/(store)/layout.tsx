import { BackToTop } from "@/components/layout/back-to-top";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { WhatsAppButton } from "@/components/layout/whatsapp-button";
import { CartDrawerProvider } from "@/components/store/cart-drawer";
import { whatsappLink } from "@/lib/whatsapp";
import { getStoreSettings } from "@/server/settings";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const settings = await getStoreSettings();
  const whatsapp = whatsappLink(settings.whatsappNumber, `Hi, I have a question for ${settings.storeName}.`);
  return (
    <CartDrawerProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter />
      {whatsapp ? <WhatsAppButton href={whatsapp} /> : null}
      <BackToTop raised={Boolean(whatsapp)} />
    </CartDrawerProvider>
  );
}
