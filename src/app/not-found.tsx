import Link from "next/link";
import { SearchX } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-soft">
      <header className="container-page flex h-20 items-center">
        <Logo />
      </header>
      <main id="main" className="container-page flex flex-1 items-start justify-center pt-10">
        <div className="w-full max-w-xl rounded-lg border border-line bg-surface">
          <EmptyState
            icon={<SearchX />}
            title="We couldn't find that page"
            description="The page may have moved, or the product may no longer be available."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/shop" className={buttonVariants()}>
                  Browse groceries
                </Link>
                <Link href="/" className={buttonVariants({ variant: "outline" })}>
                  Go to homepage
                </Link>
              </div>
            }
          />
        </div>
      </main>
    </div>
  );
}
