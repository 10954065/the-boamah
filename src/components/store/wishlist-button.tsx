"use client";

import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { toggleWishlist } from "@/actions/wishlist";
import { cn } from "@/lib/utils";

interface WishlistButtonProps {
  productId: string;
  productName: string;
  initialSaved: boolean;
  className?: string;
  variant?: "icon" | "full";
}

export function WishlistButton({ productId, productName, initialSaved, className, variant = "icon" }: WishlistButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useOptimistic(initialSaved);

  const onClick = () =>
    startTransition(async () => {
      setSaved(!saved);
      const result = await toggleWishlist({ productId });
      if (!result.ok) {
        if (result.error === "SIGN_IN_REQUIRED") {
          toast.info("Sign in to save products to your wishlist.");
          router.push(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      router.refresh();
    });

  const label = saved ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`;

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={saved}
        className={cn(
          "inline-flex h-12 items-center gap-2 rounded-md border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:border-ink-subtle hover:bg-soft",
          className,
        )}
      >
        <Heart className={cn("h-4 w-4", saved && "fill-sale text-sale")} aria-hidden="true" />
        {saved ? "Saved" : "Save"}
        <span className="sr-only"> — {label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={saved}
      aria-label={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full bg-surface/95 text-ink-muted shadow-sm ring-1 ring-line transition-colors hover:text-sale",
        className,
      )}
    >
      <Heart className={cn("h-4 w-4", saved && "fill-sale text-sale")} aria-hidden="true" />
    </button>
  );
}
