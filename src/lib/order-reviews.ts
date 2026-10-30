import { z } from "zod";

export const REVIEW_TITLE_MAX = 80;
export const REVIEW_BODY_MIN = 10;
export const REVIEW_BODY_MAX = 1000;

/**
 * A review from a delivered order. The order is proven either by its private
 * link (token, or the cookie it left on this device) or by the email or phone
 * number used for it, the same as tracking.
 */
export const orderReviewSchema = z.object({
  reference: z.string().trim().min(8).max(40),
  token: z.string().trim().max(200).optional(),
  contact: z.string().trim().max(254).optional(),
  productId: z.string().min(1).max(64),
  rating: z.number().int("Choose from 1 to 5 stars.").min(1, "Choose from 1 to 5 stars.").max(5, "Choose from 1 to 5 stars."),
  title: z.string().trim().max(REVIEW_TITLE_MAX, `Keep the title under ${REVIEW_TITLE_MAX} characters.`).optional(),
  body: z
    .string()
    .trim()
    .min(REVIEW_BODY_MIN, "Write a few words about the product.")
    .max(REVIEW_BODY_MAX, `Keep the review under ${REVIEW_BODY_MAX} characters.`),
});

export type OrderReviewInput = z.input<typeof orderReviewSchema>;

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** The name shown with a review: the first name and the initial of the last, e.g. "Ama B.". */
export function reviewerName(customerName: string): string {
  const words = customerName.trim().split(/\s+/).filter(Boolean);
  const [first] = words;
  if (!first) return "Customer";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return last ? `${capitalise(first)} ${last.charAt(0).toUpperCase()}.` : capitalise(first);
}

/** A product from a delivered order and what the customer has said about it so far. */
export interface ReviewableItem {
  productId: string;
  productName: string;
  imageUrl: string | null;
  review: { rating: number; status: "PENDING" | "APPROVED" | "REJECTED" } | null;
}
