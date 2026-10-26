import { describe, expect, test } from "vitest";
import { whatsappDigits, whatsappLink } from "@/lib/whatsapp";

describe("whatsapp links", () => {
  test("rewrites a local Ghana number to the international format", () => {
    expect(whatsappDigits("024 123 4567")).toBe("233241234567");
  });

  test("keeps an international number and strips symbols", () => {
    expect(whatsappDigits("+233 24-123-4567")).toBe("233241234567");
  });

  test("rejects missing or unusable numbers", () => {
    expect(whatsappDigits(null)).toBeNull();
    expect(whatsappDigits("")).toBeNull();
    expect(whatsappDigits("12345")).toBeNull();
    expect(whatsappLink("not a number")).toBeNull();
  });

  test("encodes the ready-made message", () => {
    expect(whatsappLink("0241234567", "Hi, I'd like to ask about Royal Basmati Rice")).toBe(
      "https://wa.me/233241234567?text=Hi%2C%20I'd%20like%20to%20ask%20about%20Royal%20Basmati%20Rice",
    );
  });
});
