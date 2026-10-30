import { describe, expect, test } from "vitest";
import { orderReviewSchema, reviewerName } from "@/lib/order-reviews";

describe("reviewerName", () => {
  test("shows the first name and the initial of the last", () => {
    expect(reviewerName("Ama Boateng")).toBe("Ama B.");
    expect(reviewerName("  kwame   mensah  ")).toBe("Kwame M.");
    expect(reviewerName("Abena Serwaa Owusu")).toBe("Abena O.");
  });

  test("a single name stays as it is, and a blank one becomes a neutral label", () => {
    expect(reviewerName("Yaw")).toBe("Yaw");
    expect(reviewerName("   ")).toBe("Customer");
  });
});

describe("orderReviewSchema", () => {
  const valid = { reference: "BMH-261030-7KQ4XM", productId: "p1", rating: 4, body: "Cooks well and tastes good." };

  test("accepts a rating from 1 to 5 with a short review", () => {
    expect(orderReviewSchema.safeParse(valid).success).toBe(true);
    expect(orderReviewSchema.safeParse({ ...valid, rating: 1, title: "Good rice" }).success).toBe(true);
  });

  test("refuses ratings outside 1 to 5 and reviews too short to help anyone", () => {
    expect(orderReviewSchema.safeParse({ ...valid, rating: 0 }).success).toBe(false);
    expect(orderReviewSchema.safeParse({ ...valid, rating: 6 }).success).toBe(false);
    expect(orderReviewSchema.safeParse({ ...valid, rating: 4.5 }).success).toBe(false);
    expect(orderReviewSchema.safeParse({ ...valid, body: "ok" }).success).toBe(false);
    expect(orderReviewSchema.safeParse({ ...valid, body: "x".repeat(1001) }).success).toBe(false);
  });
});
