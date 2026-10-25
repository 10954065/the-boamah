"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { acceptCartPrices, applyCoupon, removeCartItem, removeCoupon, updateCartItem } from "@/actions/cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SellingUnitCode } from "@/lib/quantity";
import { QuantityStepper } from "./quantity-stepper";

interface LineControlsProps {
  itemId: string;
  productName: string;
  quantityMilli: number;
  stepMilli: number;
  minQtyMilli: number;
  maxMilli: number;
  unit: SellingUnitCode;
  purchasable: boolean;
}

export function CartLineControls({ itemId, productName, quantityMilli, stepMilli, minQtyMilli, maxMilli, unit, purchasable }: LineControlsProps) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(quantityMilli);

  const change = (next: number) => {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await updateCartItem({ itemId, quantityMilli: next });
      if (!result.ok) {
        setValue(previous);
        toast.error(result.error);
      }
    });
  };

  const remove = () =>
    startTransition(async () => {
      const result = await removeCartItem({ itemId });
      if (!result.ok) toast.error(result.error);
    });

  return (
    <div className="flex items-center gap-2">
      {purchasable ? (
        <QuantityStepper
          size="sm"
          value={value}
          onChange={change}
          stepMilli={stepMilli}
          minMilli={minQtyMilli}
          maxMilli={Math.max(maxMilli, value)}
          unit={unit}
          disabled={pending}
          label={`Quantity of ${productName}`}
        />
      ) : null}
      <Button variant="ghost" size="icon-sm" onClick={remove} disabled={pending} aria-label={`Remove ${productName} from cart`}>
        <Trash2 />
      </Button>
    </div>
  );
}

export function AcceptPricesButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await acceptCartPrices();
          if (!result.ok) toast.error(result.error);
        })
      }
    >
      OK, continue with new prices
    </Button>
  );
}

export function CouponForm({ appliedCode, message }: { appliedCode: string | null; message: string | null }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (appliedCode) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-leaf-500 bg-leaf-50 px-3 py-2 text-sm">
          <span>
            Coupon <strong className="font-mono">{appliedCode}</strong>
          </span>
          <button
            type="button"
            className="text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await removeCoupon();
              })
            }
          >
            Remove
          </button>
        </div>
        {message ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await applyCoupon({ code });
          if (result.ok) {
            setCode("");
            toast.success("Coupon applied.");
          } else {
            setError(result.error);
          }
        });
      }}
    >
      <label htmlFor="coupon-code" className="text-sm font-medium text-ink">
        Coupon code
      </label>
      <div className="flex gap-2">
        <Input
          id="coupon-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Enter code"
          maxLength={40}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "coupon-error" : undefined}
          className="h-9 font-mono uppercase"
        />
        <Button type="submit" size="sm" variant="outline" className="h-9" disabled={pending || code.trim().length < 2}>
          Apply
        </Button>
      </div>
      {error ? (
        <p id="coupon-error" role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
