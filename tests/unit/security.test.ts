import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { parseListingParams } from "@/lib/listing-params";
import { safeRedirectPath, slugify } from "@/lib/utils";
import { isValidPaystackSignature } from "@/server/payments/paystack";
import { detectImageType, isAllowedImageUrl, uploadedFile } from "@/server/storage";

describe("Paystack webhook signature", () => {
  const key = "sk_test_abc";
  const body = JSON.stringify({ event: "charge.success", data: { reference: "R1" } });
  const good = createHmac("sha512", key).update(body).digest("hex");

  test("accepts the correct HMAC-SHA512 signature", () => {
    expect(isValidPaystackSignature(body, good, key)).toBe(true);
  });

  test("rejects tampered bodies, wrong keys and missing signatures", () => {
    expect(isValidPaystackSignature(body.replace("R1", "R2"), good, key)).toBe(false);
    expect(isValidPaystackSignature(body, good, "sk_test_other")).toBe(false);
    expect(isValidPaystackSignature(body, null, key)).toBe(false);
    expect(isValidPaystackSignature(body, "short", key)).toBe(false);
    expect(isValidPaystackSignature(body, good, undefined)).toBe(false);
  });
});

describe("upload validation", () => {
  test("detects real image types from bytes", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))?.ext).toBe("jpg");
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))?.ext).toBe("png");
    expect(detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))?.ext).toBe("webp");
  });

  test("rejects disguised files such as HTML or SVG", () => {
    expect(detectImageType(new TextEncoder().encode("<svg onload=alert(1)>   "))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<!doctype html><html>"))).toBeNull();
  });

  test("only allows local or Blob-hosted image URLs", () => {
    expect(isAllowedImageUrl("/images/products/tomatoes.webp")).toBe(true);
    expect(isAllowedImageUrl("/uploads/products/x.png")).toBe(true);
    expect(isAllowedImageUrl("https://abc.public.blob.vercel-storage.com/p.png")).toBe(true);
    expect(isAllowedImageUrl("/images/../../etc/passwd")).toBe(false);
    expect(isAllowedImageUrl("https://evil.example.com/x.png")).toBe(false);
    expect(isAllowedImageUrl("javascript:alert(1)")).toBe(false);
  });

  test("serves only the file names storeImage creates from the upload disk", () => {
    expect(uploadedFile(["products", "1761700000000-0123456789abcdef.webp"])).toEqual({
      relative: "products/1761700000000-0123456789abcdef.webp",
      contentType: "image/webp",
    });
    expect(uploadedFile(["banners", "1761700000000-0123456789abcdef.jpg"])?.contentType).toBe("image/jpeg");
    expect(uploadedFile(["..", "1761700000000-0123456789abcdef.png"])).toBeNull();
    expect(uploadedFile(["products", "..", "secret.png"])).toBeNull();
    expect(uploadedFile(["products", "../../etc/passwd"])).toBeNull();
    expect(uploadedFile(["products", "1761700000000-0123456789abcdef.svg"])).toBeNull();
    expect(uploadedFile(["private", "1761700000000-0123456789abcdef.png"])).toBeNull();
    expect(uploadedFile(["products"])).toBeNull();
  });
});

describe("redirect and URL helpers", () => {
  test("only allows same-site relative redirects", () => {
    expect(safeRedirectPath("/account/orders")).toBe("/account/orders");
    expect(safeRedirectPath("https://evil.com")).toBe("/");
    expect(safeRedirectPath("//evil.com")).toBe("/");
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
    expect(safeRedirectPath(undefined, "/x")).toBe("/x");
  });

  test("slugify produces URL-safe slugs", () => {
    expect(slugify("The Boamah's Fresh Tomatoes!")).toBe("the-boamahs-fresh-tomatoes");
    expect(slugify("  Gari — 5 kg  ")).toBe("gari-5-kg");
  });

  test("listing params fall back to safe defaults", () => {
    const params = parseListingParams({ sort: "drop table", page: "-3", category: "../../x", min: "abc", stock: "1" });
    expect(params.sort).toBe("featured");
    expect(params.page).toBe(1);
    expect(params.category).toBe("");
    expect(params.minPriceMinor).toBeUndefined();
    expect(params.inStock).toBe(true);
  });
});
