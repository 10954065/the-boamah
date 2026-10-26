"use client";

import { Check, Star } from "lucide-react";
import { useState, useTransition } from "react";
import { submitReview } from "@/actions/reviews";
import { Button } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

interface ReviewFormProps {
  productId: string;
  initial?: { rating: number; title: string | null; body: string };
  onCancel?: () => void;
}

function StarPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-ink">Your rating</legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer rounded p-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500" onMouseEnter={() => setHover(n)}>
            <input type="radio" name="rating" value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
            <Star
              aria-hidden="true"
              className={cn(
                "h-7 w-7 transition-[color,transform] duration-150 motion-safe:hover:scale-110",
                n <= shown ? "fill-gold-500 text-gold-500" : "fill-transparent text-line-strong",
                value === n && "pop",
              )}
            />
            <span className="sr-only">
              {n} star{n === 1 ? "" : "s"}, {RATING_WORDS[n]}
            </span>
          </label>
        ))}
        <span className="ml-2 text-sm font-medium text-ink-muted" aria-hidden="true">
          {RATING_WORDS[shown]}
        </span>
      </div>
    </fieldset>
  );
}

/** Write or edit a review. Edited reviews go back for approval. */
export function ReviewForm({ productId, initial, onCancel }: ReviewFormProps) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800" role="status">
        <Check className="pop h-4 w-4" aria-hidden="true" /> {done}
      </p>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (rating === 0) {
      setErrors({ rating: "Choose a star rating." });
      return;
    }
    startTransition(async () => {
      const result = await submitReview({ productId, rating, title: title || undefined, body });
      if (result.ok) {
        setErrors({});
        setDone(result.message ?? "Thanks for your review.");
      } else {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.fieldErrors ? null : result.error);
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <div>
        <StarPicker value={rating} onChange={(n) => { setRating(n); setErrors((e) => ({ ...e, rating: "" })); }} />
        {errors.rating ? <p className="mt-1 text-xs font-medium text-danger">{errors.rating}</p> : null}
      </div>
      <Field id="review-title" label="Title" hint="Optional, e.g. Great value for a big family." error={errors.title}>
        <Input {...fieldAria("review-title", errors.title, "hint")} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field id="review-body" label="Your review" required error={errors.body}>
        <Textarea
          {...fieldAria("review-body", errors.body)}
          rows={4}
          maxLength={2000}
          placeholder="What did you like? How did you use it?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner label="Sending" /> : null} {initial ? "Update review" : "Submit review"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <p className="text-xs text-ink-muted">Reviews appear after a quick check by our team.</p>
      </div>
    </form>
  );
}

export type ComposerState =
  | { state: "SIGNED_OUT"; signInHref: string }
  | { state: "NOT_PURCHASED" }
  | { state: "CAN_REVIEW" }
  | { state: "REVIEWED"; status: "PENDING" | "APPROVED" | "REJECTED"; rating: number; title: string | null; body: string };

const REVIEWED_NOTE: Record<"PENDING" | "APPROVED" | "REJECTED", string> = {
  PENDING: "Thanks for your review. It will appear once our team has checked it.",
  APPROVED: "Your review is published. Thank you for helping other shoppers.",
  REJECTED: "Your review was not published. You can edit it and send it again.",
};

/** What a shopper sees in the "write a review" slot, depending on whether they may review. */
export function ReviewComposer({ productId, composer }: { productId: string; composer: ComposerState }) {
  const [editing, setEditing] = useState(false);
  if (composer.state === "SIGNED_OUT") {
    return (
      <p className="text-sm text-ink-muted">
        Bought this from us?{" "}
        <a href={composer.signInHref} className="font-semibold text-brand-700 hover:underline">
          Sign in
        </a>{" "}
        to review it.
      </p>
    );
  }
  if (composer.state === "NOT_PURCHASED") {
    return <p className="text-sm text-ink-muted">Only customers who have received this product can review it, so every review comes from a real order.</p>;
  }
  if (composer.state === "CAN_REVIEW") return <ReviewForm productId={productId} />;
  if (editing) return <ReviewForm productId={productId} initial={composer} onCancel={() => setEditing(false)} />;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-soft/70 px-4 py-3 text-sm">
      <p className="text-ink-muted">{REVIEWED_NOTE[composer.status]}</p>
      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
        Edit my review
      </Button>
    </div>
  );
}
