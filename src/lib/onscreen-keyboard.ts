/**
 * The till's on-screen keyboard, for counter devices with a touch screen and
 * no physical keyboard: which keys a field gets, and what a key press does to
 * the text. The keyboard itself is components/pos/onscreen-keyboard.tsx.
 */

/** Letters for words, a number pad for amounts and phone numbers. */
export type KeyboardLayout = "text" | "decimal" | "digits";

const TEXT_TYPES = new Set(["text", "search", "email", "password", "url"]);

export interface FieldShape {
  tag: "input" | "textarea";
  type: string;
  inputMode: string;
  readOnly: boolean;
  disabled: boolean;
  /** `data-keyboard="none"`: the field has its own keypad beside it. */
  keyboard: string | null;
}

/** The keys a field gets, or null when the on-screen keyboard leaves it alone. */
export function layoutFor(field: FieldShape): KeyboardLayout | null {
  if (field.readOnly || field.disabled || field.keyboard === "none") return null;
  if (field.tag === "textarea") return "text";
  const type = field.type.toLowerCase() || "text";
  if (field.inputMode === "decimal" || type === "number") return "decimal";
  if (field.inputMode === "numeric" || field.inputMode === "tel" || type === "tel") return "digits";
  return TEXT_TYPES.has(type) ? "text" : null;
}

export type KeyAction = { kind: "type"; text: string } | { kind: "back" } | { kind: "clear" };

export interface TextState {
  value: string;
  /** The selection, or null for fields that do not report one (email and number fields). */
  start: number | null;
  end: number | null;
  /** The field's maxlength, or a negative number for none. */
  maxLength: number;
}

/** The field's text and caret after a key, or null when the key changes nothing. */
export function applyKey(state: TextState, action: KeyAction): { value: string; caret: number } | null {
  const { value, maxLength } = state;
  const start = Math.min(state.start ?? value.length, value.length);
  const end = Math.max(Math.min(state.end ?? value.length, value.length), start);

  if (action.kind === "clear") return value === "" ? null : { value: "", caret: 0 };

  if (action.kind === "back") {
    if (start !== end) return { value: value.slice(0, start) + value.slice(end), caret: start };
    if (start === 0) return null;
    // A character outside the basic plane (an emoji) is two code units.
    const width = start >= 2 && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(value.slice(start - 2, start)) ? 2 : 1;
    return { value: value.slice(0, start - width) + value.slice(end), caret: start - width };
  }

  const room = maxLength >= 0 ? maxLength - (value.length - (end - start)) : Infinity;
  const text = action.text.slice(0, Math.max(room, 0));
  if (text === "") return null;
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
}
