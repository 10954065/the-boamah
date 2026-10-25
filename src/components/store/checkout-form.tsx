"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, CreditCard, Lock, MapPin, Store, Truck } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { placeOrder, quoteCheckout, type QuoteView } from "@/actions/checkout";
import { Button } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { formatQuantity, type SellingUnitCode } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { emailField, ghanaPhone } from "@/lib/validation";

export interface CheckoutZone {
  id: string;
  name: string;
  region: string;
  areas: string[];
  feeMinor: number;
  minOrderMinor: number;
  freeDeliveryThresholdMinor: number | null;
  estimatedDelivery: string | null;
}

export interface CheckoutAddress {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  city: string;
  area: string;
  addressLine: string;
  details: string | null;
  zoneId: string | null;
  isDefault: boolean;
}

export interface CheckoutLine {
  itemId: string;
  productName: string;
  variantName: string;
  imageUrl: string | null;
  quantityMilli: number;
  unit: SellingUnitCode;
  lineTotalMinor: number;
}

interface CheckoutFormProps {
  lines: CheckoutLine[];
  zones: CheckoutZone[];
  addresses: CheckoutAddress[];
  user: { name: string; email: string; phone: string | null } | null;
  pickup: { enabled: boolean; address: string | null; instructions: string | null };
  payment: { online: boolean; cod: boolean; testMode: boolean };
  initialQuote: QuoteView | null;
}

const NOT_LISTED = "__not_listed__";

const formSchema = z
  .object({
    customerName: z.string().trim().min(2, "Enter your full name.").max(80),
    email: z.union([z.literal(""), emailField]),
    phone: ghanaPhone,
    fulfilmentMethod: z.enum(["DELIVERY", "PICKUP"]),
    zoneId: z.string(),
    city: z.string().trim().max(80),
    area: z.string().trim().max(80),
    addressLine: z.string().trim().max(200),
    addressDetails: z.string().trim().max(200),
    deliveryInstructions: z.string().trim().max(500),
    paymentMethod: z.enum(["PAYSTACK", "CASH_ON_DELIVERY"]),
    saveAddress: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.fulfilmentMethod !== "DELIVERY") return;
    if (!data.zoneId) ctx.addIssue({ code: "custom", path: ["zoneId"], message: "Choose your delivery area." });
    if (!data.city) ctx.addIssue({ code: "custom", path: ["city"], message: "Enter your town or city." });
    if (!data.area) ctx.addIssue({ code: "custom", path: ["area"], message: "Enter your area or neighbourhood." });
    if (data.addressLine.length < 3) ctx.addIssue({ code: "custom", path: ["addressLine"], message: "Enter your street address or a landmark." });
  });

type FormValues = z.input<typeof formSchema>;

function RadioCard({
  checked,
  disabled,
  onSelect,
  icon,
  title,
  description,
  name,
  value,
}: {
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description?: string;
  name: string;
  value: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-md border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500",
        checked ? "border-brand-600 bg-brand-50" : "border-line-strong bg-surface hover:border-ink-subtle",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onSelect} className="mt-1 h-4 w-4 accent-brand-700" />
      <span className="flex-1">
        <span className="flex items-center gap-2 font-semibold text-ink [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-brand-600">
          {icon}
          {title}
        </span>
        {description ? <span className="mt-0.5 block text-sm text-ink-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function CheckoutForm({ lines, zones, addresses, user, pickup, payment, initialQuote }: CheckoutFormProps) {
  const router = useRouter();
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
  const deliveryAvailable = zones.length > 0;
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [quote, setQuote] = useState<QuoteView | null>(initialQuote);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [quoting, startQuote] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: defaultAddress?.recipientName ?? user?.name ?? "",
      email: user?.email ?? "",
      phone: defaultAddress?.phone ?? user?.phone ?? "",
      fulfilmentMethod: deliveryAvailable ? "DELIVERY" : "PICKUP",
      zoneId: defaultAddress?.zoneId && zones.some((z) => z.id === defaultAddress.zoneId) ? defaultAddress.zoneId : "",
      city: defaultAddress?.city ?? "",
      area: defaultAddress?.area ?? "",
      addressLine: defaultAddress?.addressLine ?? "",
      addressDetails: defaultAddress?.details ?? "",
      deliveryInstructions: "",
      paymentMethod: payment.online ? "PAYSTACK" : "CASH_ON_DELIVERY",
      saveAddress: Boolean(user) && addresses.length === 0,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const fulfilmentMethod = useWatch({ control: form.control, name: "fulfilmentMethod" });
  const zoneId = useWatch({ control: form.control, name: "zoneId" });
  const paymentMethod = useWatch({ control: form.control, name: "paymentMethod" });
  const selectedZone = zones.find((z) => z.id === zoneId);
  const notListed = fulfilmentMethod === "DELIVERY" && zoneId === NOT_LISTED;

  const refreshQuote = useCallback(
    (method: "DELIVERY" | "PICKUP", zone: string) => {
      startQuote(async () => {
        const result = await quoteCheckout({ fulfilmentMethod: method, zoneId: zone && zone !== NOT_LISTED ? zone : undefined });
        if (result.ok) {
          setQuote(result.data);
          setQuoteError(null);
        } else {
          setQuoteError(result.error);
        }
      });
    },
    [],
  );

  useEffect(() => {
    refreshQuote(fulfilmentMethod, zoneId);
  }, [fulfilmentMethod, zoneId, refreshQuote]);

  const applyAddress = (id: string) => {
    const address = addresses.find((a) => a.id === id);
    if (!address) return;
    form.setValue("customerName", address.recipientName);
    form.setValue("phone", address.phone);
    form.setValue("city", address.city);
    form.setValue("area", address.area);
    form.setValue("addressLine", address.addressLine);
    form.setValue("addressDetails", address.details ?? "");
    if (address.zoneId && zones.some((z) => z.id === address.zoneId)) form.setValue("zoneId", address.zoneId);
  };

  const deliveryReady = fulfilmentMethod === "PICKUP" ? pickup.enabled : Boolean(selectedZone) && !quoteError;
  const canSubmit = Boolean(quote) && deliveryReady && !notListed && !quoting && (payment.online || payment.cod);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!quote) return;
    setFormError(null);
    const result = await placeOrder({
      ...values,
      idempotencyKey,
      zoneId: values.fulfilmentMethod === "DELIVERY" ? values.zoneId : undefined,
      expectedTotalMinor: quote.totals.totalMinor,
    });
    if (!result.ok) {
      if (result.error.startsWith("TOTAL_CHANGED:")) {
        setFormError(result.error.slice("TOTAL_CHANGED:".length));
        refreshQuote(values.fulfilmentMethod, values.zoneId);
      } else {
        setFormError(result.error);
      }
      if (result.fieldErrors) {
        for (const [key, message] of Object.entries(result.fieldErrors)) {
          form.setError(key as keyof FormValues, { message });
        }
      }
      return;
    }
    if (result.data.external) {
      window.location.assign(result.data.redirectTo);
    } else {
      router.push(result.data.redirectTo);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-8 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}

        <section aria-labelledby="contact-title" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
          <h2 id="contact-title" className="text-lg font-extrabold">
            1. Contact details
          </h2>
          {!user ? (
            <p className="mt-1 text-sm text-ink-muted">
              Checking out as a guest.{" "}
              <Link href="/login?next=/checkout" className="font-semibold text-brand-700 hover:underline">
                Sign in
              </Link>{" "}
              to use saved addresses.
            </p>
          ) : null}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field id="customerName" label="Full name" required error={errors.customerName?.message} className="sm:col-span-2">
              <Input autoComplete="name" {...fieldAria("customerName", errors.customerName?.message)} {...form.register("customerName")} />
            </Field>
            <Field
              id="email"
              label="Email address"
              required={!user || paymentMethod === "PAYSTACK"}
              hint="For your order confirmation and receipt."
              error={errors.email?.message}
            >
              <Input type="email" autoComplete="email" {...fieldAria("email", errors.email?.message, "hint")} {...form.register("email")} />
            </Field>
            <Field id="phone" label="Phone number" required hint="We'll call this number about your delivery." error={errors.phone?.message}>
              <Input type="tel" autoComplete="tel" placeholder="024 123 4567" {...fieldAria("phone", errors.phone?.message, "hint")} {...form.register("phone")} />
            </Field>
          </div>
        </section>

        <section aria-labelledby="fulfilment-title" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
          <h2 id="fulfilment-title" className="text-lg font-extrabold">
            2. Delivery or pickup
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <RadioCard
              name="fulfilmentMethod"
              value="DELIVERY"
              checked={fulfilmentMethod === "DELIVERY"}
              disabled={!deliveryAvailable}
              onSelect={() => form.setValue("fulfilmentMethod", "DELIVERY")}
              icon={<Truck />}
              title="Delivery"
              description={deliveryAvailable ? "To your home or office in our delivery areas." : "Delivery areas have not been set up yet."}
            />
            <RadioCard
              name="fulfilmentMethod"
              value="PICKUP"
              checked={fulfilmentMethod === "PICKUP"}
              disabled={!pickup.enabled}
              onSelect={() => form.setValue("fulfilmentMethod", "PICKUP")}
              icon={<Store />}
              title="Pickup"
              description={pickup.enabled ? "Collect your order from our store." : "Pickup is currently unavailable."}
            />
          </div>

          {fulfilmentMethod === "DELIVERY" ? (
            <div className="mt-5 space-y-4">
              {addresses.length > 0 ? (
                <Field id="savedAddress" label="Use a saved address">
                  <Select id="savedAddress" defaultValue={defaultAddress?.id ?? ""} onChange={(event) => applyAddress(event.target.value)}>
                    {addresses.map((address) => (
                      <option key={address.id} value={address.id}>
                        {address.label ? `${address.label} — ` : ""}
                        {address.addressLine}, {address.area}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field id="zoneId" label="Delivery area" required error={errors.zoneId?.message}>
                <Select {...fieldAria("zoneId", errors.zoneId?.message)} {...form.register("zoneId")}>
                  <option value="">Select your area…</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} ({zone.region}){zone.areas.length ? ` — ${zone.areas.slice(0, 4).join(", ")}` : ""}
                    </option>
                  ))}
                  <option value={NOT_LISTED}>My area isn&rsquo;t listed</option>
                </Select>
              </Field>
              {notListed ? (
                <Alert tone="warning" title="We can't deliver to your area yet">
                  {pickup.enabled ? "You can choose pickup instead, or " : "Please "}
                  <Link href="/contact" className="font-semibold underline">
                    contact us
                  </Link>{" "}
                  to ask about delivery to your location.
                </Alert>
              ) : null}
              {selectedZone ? (
                <p className="flex items-start gap-2 rounded-md bg-soft px-3 py-2 text-sm text-ink-muted">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                  <span>
                    Delivery fee {formatMoney(selectedZone.feeMinor)}
                    {selectedZone.freeDeliveryThresholdMinor !== null ? ` · free from ${formatMoney(selectedZone.freeDeliveryThresholdMinor)}` : ""}
                    {selectedZone.minOrderMinor > 0 ? ` · minimum order ${formatMoney(selectedZone.minOrderMinor)}` : ""}
                    {selectedZone.estimatedDelivery ? ` · ${selectedZone.estimatedDelivery}` : ""}
                  </span>
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="city" label="Town / city" required error={errors.city?.message}>
                  <Input autoComplete="address-level2" {...fieldAria("city", errors.city?.message)} {...form.register("city")} />
                </Field>
                <Field id="area" label="Area / neighbourhood" required error={errors.area?.message}>
                  <Input autoComplete="address-level3" {...fieldAria("area", errors.area?.message)} {...form.register("area")} />
                </Field>
              </div>
              <Field id="addressLine" label="Street address or landmark" required hint="House number, street name or a nearby landmark." error={errors.addressLine?.message}>
                <Input autoComplete="street-address" {...fieldAria("addressLine", errors.addressLine?.message, "hint")} {...form.register("addressLine")} />
              </Field>
              <Field id="addressDetails" label="Additional details" hint="Optional — apartment, gate colour, GhanaPost GPS address." error={errors.addressDetails?.message}>
                <Input {...fieldAria("addressDetails", errors.addressDetails?.message, "hint")} {...form.register("addressDetails")} />
              </Field>
              {user ? (
                <label className="flex items-center gap-2 text-sm text-ink-muted">
                  <Checkbox {...form.register("saveAddress")} /> Save this address to my account
                </label>
              ) : null}
            </div>
          ) : pickup.enabled ? (
            <div className="mt-5 rounded-md bg-soft p-4 text-sm text-ink-muted">
              <p className="font-semibold text-ink">Pickup location</p>
              <p className="mt-1 whitespace-pre-line">{pickup.address ?? "The pickup location will be confirmed with your order."}</p>
              {pickup.instructions ? <p className="mt-2 whitespace-pre-line">{pickup.instructions}</p> : null}
            </div>
          ) : null}

          <Field id="deliveryInstructions" label={fulfilmentMethod === "PICKUP" ? "Notes for our team" : "Delivery instructions"} className="mt-4" error={errors.deliveryInstructions?.message}>
            <Textarea rows={2} {...fieldAria("deliveryInstructions", errors.deliveryInstructions?.message)} {...form.register("deliveryInstructions")} />
          </Field>
        </section>

        <section aria-labelledby="payment-title" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
          <h2 id="payment-title" className="text-lg font-extrabold">
            3. Payment
          </h2>
          {!payment.online && !payment.cod ? (
            <Alert tone="warning" className="mt-4" title="Checkout is temporarily unavailable">
              No payment method is currently enabled. Please contact us to place your order.
            </Alert>
          ) : (
            <div className="mt-4 grid gap-3">
              {payment.online ? (
                <RadioCard
                  name="paymentMethod"
                  value="PAYSTACK"
                  checked={paymentMethod === "PAYSTACK"}
                  onSelect={() => form.setValue("paymentMethod", "PAYSTACK")}
                  icon={<CreditCard />}
                  title="Pay online — Mobile Money or card"
                  description={`You'll be taken to Paystack's secure page to complete payment.${payment.testMode ? " (Test mode — no real money is taken.)" : ""}`}
                />
              ) : null}
              {payment.cod ? (
                <RadioCard
                  name="paymentMethod"
                  value="CASH_ON_DELIVERY"
                  checked={paymentMethod === "CASH_ON_DELIVERY"}
                  onSelect={() => form.setValue("paymentMethod", "CASH_ON_DELIVERY")}
                  icon={<Banknote />}
                  title={fulfilmentMethod === "PICKUP" ? "Pay on collection" : "Cash on delivery"}
                  description="Pay when you receive your order."
                />
              ) : null}
            </div>
          )}
        </section>
      </div>

      <aside aria-labelledby="checkout-summary-title" className="h-fit space-y-4 rounded-lg border border-line bg-surface p-5 lg:sticky lg:top-32">
        <h2 id="checkout-summary-title" className="text-lg font-extrabold">
          Order summary
        </h2>
        <ul className="max-h-72 space-y-3 overflow-y-auto pr-1">
          {lines.map((line) => (
            <li key={line.itemId} className="flex gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-soft">
                {line.imageUrl ? <Image src={line.imageUrl} alt="" fill sizes="56px" className="object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium text-ink">{line.productName}</p>
                <p className="text-ink-muted">
                  {line.variantName} · {formatQuantity(line.quantityMilli, line.unit)}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(line.lineTotalMinor)}</p>
            </li>
          ))}
        </ul>
        <div aria-live="polite" className="space-y-2.5 border-t border-line pt-4 text-sm">
          {quoteError ? <Alert tone="warning">{quoteError}</Alert> : null}
          {quote && !quoteError ? (
            <dl className={cn("space-y-2.5", quoting && "opacity-60")}>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(quote.totals.subtotalMinor)}</dd>
              </div>
              {quote.totals.discountMinor > 0 ? (
                <div className="flex justify-between text-success">
                  <dt>Discount{quote.couponCode ? ` (${quote.couponCode})` : ""}</dt>
                  <dd className="tabular-nums">−{formatMoney(quote.totals.discountMinor)}</dd>
                </div>
              ) : null}
              {quote.couponMessage ? <p className="text-xs text-danger">Coupon not applied: {quote.couponMessage}</p> : null}
              <div className="flex justify-between">
                <dt className="text-ink-muted">{fulfilmentMethod === "PICKUP" ? "Pickup" : "Delivery"}</dt>
                <dd className="tabular-nums">
                  {fulfilmentMethod === "DELIVERY" && !selectedZone
                    ? "Select your area"
                    : quote.totals.deliveryFeeMinor === 0
                      ? "Free"
                      : formatMoney(quote.totals.deliveryFeeMinor)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
                <dt>Total to pay</dt>
                <dd className="tabular-nums">{formatMoney(quote.totals.totalMinor)}</dd>
              </div>
              <p className="text-xs text-ink-subtle">Prices include applicable taxes.</p>
            </dl>
          ) : null}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? <Spinner label="Placing order" /> : <Lock />}
          {paymentMethod === "PAYSTACK" ? "Continue to secure payment" : "Place order"}
        </Button>
        <p className="text-center text-xs text-ink-subtle">
          By placing your order you agree to our{" "}
          <Link href="/policies/terms" className="underline">
            terms
          </Link>
          .
        </p>
      </aside>
    </form>
  );
}
