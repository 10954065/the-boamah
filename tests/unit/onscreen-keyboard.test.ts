import { describe, expect, it } from "vitest";
import { applyKey, layoutFor, type FieldShape } from "@/lib/onscreen-keyboard";

const field = (shape: Partial<FieldShape>): FieldShape => ({ tag: "input", type: "text", inputMode: "", readOnly: false, disabled: false, keyboard: null, ...shape });

describe("layoutFor", () => {
  it("gives words to text, search, email and password fields", () => {
    for (const type of ["text", "search", "email", "password", ""]) expect(layoutFor(field({ type }))).toBe("text");
    expect(layoutFor(field({ tag: "textarea", type: "" }))).toBe("text");
  });

  it("gives a number pad to amounts and phone numbers", () => {
    expect(layoutFor(field({ inputMode: "decimal" }))).toBe("decimal");
    expect(layoutFor(field({ type: "number" }))).toBe("decimal");
    expect(layoutFor(field({ type: "tel", inputMode: "tel" }))).toBe("digits");
    expect(layoutFor(field({ inputMode: "numeric" }))).toBe("digits");
  });

  it("leaves alone fields it cannot type into or that have their own keypad", () => {
    expect(layoutFor(field({ readOnly: true }))).toBeNull();
    expect(layoutFor(field({ disabled: true }))).toBeNull();
    expect(layoutFor(field({ keyboard: "none", inputMode: "decimal" }))).toBeNull();
    for (const type of ["checkbox", "radio", "date", "file", "range"]) expect(layoutFor(field({ type }))).toBeNull();
  });
});

describe("applyKey", () => {
  const at = (value: string, start: number | null, end = start, maxLength = -1) => ({ value, start, end, maxLength });

  it("types at the caret and replaces a selection", () => {
    expect(applyKey(at("rice", 2), { kind: "type", text: "X" })).toEqual({ value: "riXce", caret: 3 });
    expect(applyKey(at("rice", 1, 3), { kind: "type", text: "a" })).toEqual({ value: "rae", caret: 2 });
  });

  it("types at the end of fields that do not report a caret", () => {
    expect(applyKey(at("ama@", null), { kind: "type", text: "x" })).toEqual({ value: "ama@x", caret: 5 });
  });

  it("stops at the field's maximum length", () => {
    expect(applyKey(at("abc", 3, 3, 3), { kind: "type", text: "d" })).toBeNull();
    expect(applyKey(at("abc", 3, 3, 4), { kind: "type", text: ".com" })).toEqual({ value: "abc.", caret: 4 });
    expect(applyKey(at("abc", 0, 3, 3), { kind: "type", text: "xyz" })).toEqual({ value: "xyz", caret: 3 });
  });

  it("deletes the character before the caret, or the selection", () => {
    expect(applyKey(at("rice", 4), { kind: "back" })).toEqual({ value: "ric", caret: 3 });
    expect(applyKey(at("rice", 1, 3), { kind: "back" })).toEqual({ value: "re", caret: 1 });
    expect(applyKey(at("rice", 0), { kind: "back" })).toBeNull();
    expect(applyKey(at("ok👍", 4), { kind: "back" })).toEqual({ value: "ok", caret: 2 });
  });

  it("clears the field", () => {
    expect(applyKey(at("12.50", 2), { kind: "clear" })).toEqual({ value: "", caret: 0 });
    expect(applyKey(at("", 0), { kind: "clear" })).toBeNull();
  });
});
