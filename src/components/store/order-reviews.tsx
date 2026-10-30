"use client";

import Image from "next/image";
import { ImageOff, Star } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { submitOrderReview } from "@/actions/reviews";
import { Button } from "@/components/ui/button";
import { ClientForm } from "@/components/ui/client-form";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { REVIEW_BODY_MAX, REVIEW_TITLE_MAX, type ReviewableItem } from "@/lib/order-reviews";
import { cn } from "@/lib/utils";
import { Stars } from "./stars";

/** How the order was opened: its private link (or this device's cookie), or tracking with the email or phone used. */
export interface ReviewAccess {
  reference: string;
  token?: string;
  contact?: string;
}

const STATUS_TEXT: Record<NonNullable<ReviewableItem["review"]>["status"], string> = {
  PENDING: "Thank you. It will show once the shop has checked it.",
  APPROVED: "Published. Thank you for your review.",
  REJECTED: "The shop did not publish this review.",
};

function StarPicker({ value, onChange, error, label }: { value: number; onChange: (rating: number) => void; error?: string; label: string }) {
  const errorId = useId();
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      <div className="mt-1.5 flex gap-1">
        {[1, 2, 3, 4, 5].map((stars) => (
          <label key={stars} className="cursor-pointer rounded-md p-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500">
            <input type="radio" name={label} value={stars} checked={value === stars} onChange={() => onChange(stars)} className="sr-only" />
            <Star className={cn("h-8 w-8 transition-colors", stars <= value ? "fill-gold-400 text-gold-500" : "text-line-strong")} aria-hidden="true" />
            <span className="sr-only">
              {stars} {stars === 1 ? "star" : "stars"}
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function ReviewForm({ item, access, onSent }: { item: ReviewableItem; access: ReviewAccess; onSent: (rating: number) => void }) {
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  return (
    <ClientForm
      noValidate
      className="mt-4 flex flex-col gap-4 rounded-lg border border-line bg-soft/50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (rating === 0) {
          setErrors({ rating: "Choose from 1 to 5 stars." });
          return;
        }
        startTransition(async () => {
          const result = await submitOrderReview({ ...access, productId: item.productId, rating, title: title || undefined, body });
          if (result.ok) onSent(rating);
          else {
            setErrors(result.fieldErrors ?? {});
            setFormError(result.fieldErrors ? null : result.error);
          }
        });
      }}
    >
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <StarPicker label={`Your rating for ${item.productName}`} value={rating} onChange={setRating} error={errors.rating} />
      <Field id={`${id}-title`} label="Title (optional)" error={errors.title}>
        <Input {...fieldAria(`${id}-title`, errors.title)} value={title} maxLength={REVIEW_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field id={`${id}-body`} label="Your review" hint="What was good, or not? Other shoppers will read it." error={errors.body}>
        <Textarea
          {...fieldAria(`${id}-body`, errors.body, "hint")}
          rows={4}
          value={body}
          maxLength={REVIEW_BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner label="Sending" /> : null} Send review
        </Button>
      </div>
    </ClientForm>
  );
}

function ReviewRow({ item, access }: { item: ReviewableItem; access: ReviewAccess }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const review = sent !== null ? { rating: sent, status: "PENDING" as const } : item.review;

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-soft">
          {item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes="48px" className="object-cover" /> : <ImageOff className="h-5 w-5 text-ink-subtle" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{item.productName}</p>
          {review ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-muted" role={sent !== null ? "status" : undefined}>
              <Stars rating={review.rating} size="sm" /> {STATUS_TEXT[review.status]}
            </p>
          ) : null}
        </div>
        {!review && !open ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} aria-label={`Review ${item.productName}`}>
            Write a review
          </Button>
        ) : null}
      </div>
      {!review && open ? (
        <ReviewForm
          item={item}
          access={access}
          onSent={(rating) => {
            setSent(rating);
            setOpen(false);
          }}
        />
      ) : null}
    </li>
  );
}

/** "Rate what you bought" on a delivered order. Reviews wait for the shop's approval. */
export function OrderReviews({ items, access }: { items: ReviewableItem[]; access: ReviewAccess }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="rate-title" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
      <h2 id="rate-title" className="text-lg font-extrabold">
        Rate what you bought
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Your review shows on the product page once the shop has checked it, with your first name and initial.
      </p>
      <ul className="mt-5 divide-y divide-line">
        {items.map((item) => (
          <ReviewRow key={item.productId} item={item} access={access} />
        ))}
      </ul>
    </section>
  );
}
