"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ArrowBigUp, ArrowBigUpDash, CornerDownLeft, Delete, Keyboard, KeyboardOff, Maximize, Minimize } from "lucide-react";
import { applyKey, layoutFor, type KeyAction, type KeyboardLayout } from "@/lib/onscreen-keyboard";
import { cn } from "@/lib/utils";
import { setDeviceSetting, toggleFullScreen, useDeviceSetting, useFullScreen, useStayFullScreen } from "./till-device";

type Field = HTMLInputElement | HTMLTextAreaElement;
type Shift = "off" | "once" | "lock";

const LETTER_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const SYMBOL_ROWS = [`-/:;()&@"'`, "!?#%*+=_,", "₵$~|<>\\"];
const DIGIT_ROWS = ["789", "456", "123"];
/** Two taps on Shift this close together keep capitals on. */
const CAPS_LOCK_MS = 400;

/** The counter device's full screen and on-screen keyboard, on every till page. */
export function TillDeviceHost() {
  useStayFullScreen();
  const pathname = usePathname();
  return (
    <>
      {/* The till's own screens have these switches in their menu. */}
      {pathname === "/pos" ? null : <CornerSwitches />}
      <OnScreenKeyboard />
    </>
  );
}

/** Full screen and the keyboard on the sign in pages, so a device with no keyboard can sign in. */
function CornerSwitches() {
  const fullScreen = useFullScreen();
  const keyboard = useDeviceSetting("keyboard");
  const switchClass =
    "inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold shadow-sm transition-colors aria-pressed:border-brand-600 aria-pressed:bg-brand-50 aria-pressed:text-brand-900";
  return (
    <div className="fixed right-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-40 hidden gap-2 md:flex">
      {fullScreen === null ? null : (
        <button type="button" aria-pressed={fullScreen} onClick={toggleFullScreen} className={cn(switchClass, "border-line bg-surface text-ink-muted hover:text-ink")}>
          {fullScreen ? <Minimize className="h-4 w-4" aria-hidden="true" /> : <Maximize className="h-4 w-4" aria-hidden="true" />}
          Full screen
        </button>
      )}
      <button
        type="button"
        aria-pressed={keyboard}
        onClick={() => setDeviceSetting("keyboard", !keyboard)}
        className={cn(switchClass, "border-line bg-surface text-ink-muted hover:text-ink")}
      >
        <Keyboard className="h-4 w-4" aria-hidden="true" />
        On-screen keyboard
      </button>
    </div>
  );
}

function asField(target: EventTarget | null): Field | null {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : null;
}

function layoutOf(field: Field): KeyboardLayout | null {
  return layoutFor({
    tag: field instanceof HTMLTextAreaElement ? "textarea" : "input",
    type: field instanceof HTMLInputElement ? field.type : "",
    // While the keyboard is on, the field's own input mode is kept aside (see quietNativeKeyboard).
    inputMode: field.dataset.keyboardMode ?? field.inputMode,
    readOnly: field.readOnly,
    disabled: field.disabled,
    keyboard: field.dataset.keyboard ?? null,
  });
}

/** Stops the device's own keyboard (Android, Windows tablet mode) opening over this one. */
function quietNativeKeyboard(field: Field): void {
  if (field.dataset.keyboardMode !== undefined) return;
  field.dataset.keyboardMode = field.getAttribute("inputmode") ?? "";
  field.setAttribute("inputmode", "none");
}

function restoreNativeKeyboard(field: Field): void {
  const mode = field.dataset.keyboardMode;
  if (mode === undefined) return;
  delete field.dataset.keyboardMode;
  if (mode) field.setAttribute("inputmode", mode);
  else field.removeAttribute("inputmode");
}

/** Changes the text the way typing does, so React and the page's own handlers see an ordinary edit. */
function typeInto(field: Field, action: KeyAction): void {
  let start: number | null = null;
  let end: number | null = null;
  try {
    start = field.selectionStart;
    end = field.selectionEnd;
  } catch {
    // Email and number fields have no selection.
  }
  const next = applyKey({ value: field.value, start, end, maxLength: field.maxLength }, action);
  if (!next) return;
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, next.value);
  try {
    field.setSelectionRange(next.caret, next.caret);
  } catch {
    // As above.
  }
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Enter as a keyboard sends it: the field's own handler first, then a new line or the form. False when nothing took it. */
function pressEnter(field: Field): boolean {
  const init = { key: "Enter", code: "Enter", bubbles: true, cancelable: true };
  const unhandled = field.dispatchEvent(new KeyboardEvent("keydown", init));
  field.dispatchEvent(new KeyboardEvent("keyup", init));
  if (!unhandled) return true;
  if (field instanceof HTMLTextAreaElement) {
    typeInto(field, { kind: "type", text: "\n" });
    return true;
  }
  if (!field.form) return false;
  field.form.requestSubmit();
  return true;
}

/**
 * The till's on-screen keyboard, for counter devices with a touch screen and
 * no keyboard. Once switched on from the till's menu, it opens when a field is
 * tapped, or when a dialog opens with the cursor in a field, and closes when
 * the field loses the cursor. Its keys never take the cursor, so a scanner
 * keeps typing into the field. Fields with a keypad of their own opt out with
 * `data-keyboard="none"`.
 */
function OnScreenKeyboard() {
  const enabled = useDeviceSetting("keyboard");
  const [field, setField] = useState<Field | null>(null);
  const tapped = useRef<Field | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    function onPointerDown(event: PointerEvent) {
      const target = asField(event.target);
      if (!target || !layoutOf(target)) return;
      quietNativeKeyboard(target);
      tapped.current = target;
      // Tapping the field the cursor is already in brings the keyboard back after Hide.
      if (document.activeElement === target) setField(target);
    }
    function onFocusIn(event: FocusEvent) {
      const target = asField(event.target);
      if (!target || !layoutOf(target)) return setField(null);
      quietNativeKeyboard(target);
      // Script moves the cursor to the till's search box all the time; that alone does not cover the screen.
      if (tapped.current === target || target.closest('[role="dialog"]')) setField(target);
      tapped.current = null;
    }
    function onFocusOut(event: FocusEvent) {
      const target = asField(event.target);
      if (target) restoreNativeKeyboard(target);
      setField(null);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    // Switched on with the cursor already in a field: it waits for a tap.
    const current = asField(document.activeElement);
    if (current && layoutOf(current)) quietNativeKeyboard(current);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      const focused = asField(document.activeElement);
      if (focused) restoreNativeKeyboard(focused);
      setField(null);
    };
  }, [enabled]);

  const open = enabled && field !== null;

  // Pages and dialogs make room for the keyboard (globals.css), and the field stays in view.
  useEffect(() => {
    const root = document.documentElement;
    const box = panel.current;
    if (!open || !box) return;
    const observer = new ResizeObserver(() => root.style.setProperty("--keyboard-height", `${box.offsetHeight}px`));
    observer.observe(box);
    root.dataset.keyboard = "open";
    const frame = requestAnimationFrame(() => field?.scrollIntoView({ block: "nearest" }));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      delete root.dataset.keyboard;
      root.style.removeProperty("--keyboard-height");
    };
  }, [open, field]);

  if (!enabled || !field) return null;
  const layout = layoutOf(field);
  if (!layout) return null;

  const target = field;
  function press(action: KeyAction) {
    if (!target.isConnected) return setField(null);
    typeInto(target, action);
  }

  return (
    <div
      data-onscreen-keyboard=""
      role="group"
      aria-label="On-screen keyboard"
      // The till's dialogs block the rest of the page while open; the keyboard sits above them and stays usable.
      style={{ pointerEvents: "auto" }}
      ref={panel}
      onMouseDown={(event) => event.preventDefault()}
      className="fixed inset-x-0 bottom-0 z-60 select-none border-t border-line bg-soft px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-2 shadow-[var(--shadow-overlay)]"
    >
      {layout === "text" ? (
        <TextKeys email={target instanceof HTMLInputElement && target.type === "email"} onPress={press} onEnter={() => pressEnter(target) || setField(null)} onHide={() => setField(null)} />
      ) : (
        <NumberKeys decimals={layout === "decimal"} onPress={press} onEnter={() => pressEnter(target) || setField(null)} onHide={() => setField(null)} />
      )}
    </div>
  );
}

interface KeysProps {
  onPress: (action: KeyAction) => void;
  onEnter: () => void;
  onHide: () => void;
}

function TextKeys({ email, onPress, onEnter, onHide }: KeysProps & { email: boolean }) {
  const [shift, setShift] = useState<Shift>("off");
  const [symbols, setSymbols] = useState(false);
  const lastShift = useRef(0);
  const rows = symbols ? SYMBOL_ROWS : LETTER_ROWS;
  const upper = shift !== "off" && !symbols;

  function type(text: string) {
    onPress({ kind: "type", text });
    if (shift === "once") setShift("off");
  }

  function tapShift() {
    const now = Date.now();
    const quick = now - lastShift.current < CAPS_LOCK_MS;
    lastShift.current = now;
    setShift((current) => (current === "off" ? "once" : current === "once" && quick ? "lock" : "off"));
  }

  const ShiftIcon = shift === "lock" ? ArrowBigUpDash : ArrowBigUp;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-1.5">
      <Row>
        {"1234567890".split("").map((key) => (
          <Key key={key} label={key} onPress={() => type(key)} />
        ))}
      </Row>
      {rows.map((row, index) => (
        <Row key={row} className={index === 1 && !symbols ? "px-[4.5%]" : undefined}>
          {index === 2 ? (
            symbols ? (
              <span aria-hidden="true" className="flex-[1.5]" />
            ) : (
              <Key
                label={shift === "lock" ? "Capitals on" : "Shift"}
                pressed={shift !== "off"}
                className={cn("flex-[1.5]", shift !== "off" && "border-brand-600 bg-brand-50 text-brand-900")}
                onPress={tapShift}
              >
                <ShiftIcon className="mx-auto h-5 w-5" aria-hidden="true" />
              </Key>
            )
          ) : null}
          {row.split("").map((key) => {
            const text = upper ? key.toUpperCase() : key;
            return <Key key={key} label={text} onPress={() => type(text)} />;
          })}
          {index === 2 ? (
            <Key label="Delete" className="flex-[1.5]" onPress={() => onPress({ kind: "back" })}>
              <Delete className="mx-auto h-5 w-5" aria-hidden="true" />
            </Key>
          ) : null}
        </Row>
      ))}
      <Row>
        <Key label={symbols ? "Letters" : "Symbols"} className="flex-[1.5] text-sm" onPress={() => setSymbols((on) => !on)}>
          {symbols ? "ABC" : "#+="}
        </Key>
        <Key label="@" onPress={() => type("@")} />
        <Key label="Space" className="flex-5 text-sm text-ink-muted" onPress={() => type(" ")}>
          space
        </Key>
        <Key label="." onPress={() => type(".")} />
        {email ? <Key label=".com" className="flex-[1.5] text-base" onPress={() => type(".com")} /> : null}
        <EnterKey className="flex-2" onEnter={onEnter} />
        <HideKey className="flex-[1.5]" onHide={onHide} />
      </Row>
    </div>
  );
}

/** Amounts get a decimal point; phone numbers a plus, for +233. */
function NumberKeys({ decimals, onPress, onEnter, onHide }: KeysProps & { decimals: boolean }) {
  const extra = decimals ? "." : "+";
  return (
    <div className="mx-auto grid max-w-sm grid-cols-4 gap-1.5">
      {DIGIT_ROWS.map((row, index) => (
        <div key={row} className="contents">
          {row.split("").map((key) => (
            <Key key={key} label={key} onPress={() => onPress({ kind: "type", text: key })} />
          ))}
          {index === 0 ? (
            <Key label="Delete" onPress={() => onPress({ kind: "back" })}>
              <Delete className="mx-auto h-5 w-5" aria-hidden="true" />
            </Key>
          ) : index === 1 ? (
            <Key label="Clear" onPress={() => onPress({ kind: "clear" })}>
              C
            </Key>
          ) : (
            <EnterKey className="row-span-2 h-auto" onEnter={onEnter} />
          )}
        </div>
      ))}
      <Key label={decimals ? "Decimal point" : "Plus"} onPress={() => onPress({ kind: "type", text: extra })}>
        {extra}
      </Key>
      <Key label="0" onPress={() => onPress({ kind: "type", text: "0" })} />
      <HideKey onHide={onHide} />
    </div>
  );
}

function Row({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex gap-1.5", className)}>{children}</div>;
}

interface KeyProps {
  label: string;
  onPress: () => void;
  pressed?: boolean;
  className?: string;
  children?: ReactNode;
}

/** A key, the size of a fingertip. It never takes the cursor from the field. */
function Key({ label, onPress, pressed, className, children }: KeyProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        "h-12 min-w-0 flex-1 rounded-md border border-line bg-surface text-lg font-semibold text-ink shadow-sm transition-colors hover:bg-soft active:translate-y-px active:bg-brand-50",
        className,
      )}
    >
      {children ?? label}
    </button>
  );
}

function EnterKey({ className, onEnter }: { className?: string; onEnter: () => void }) {
  return (
    <Key label="Enter" className={cn("border-brand-700 bg-brand-700 text-white hover:bg-brand-600 active:bg-brand-900", className)} onPress={onEnter}>
      <CornerDownLeft className="mx-auto h-5 w-5" aria-hidden="true" />
    </Key>
  );
}

function HideKey({ className, onHide }: { className?: string; onHide: () => void }) {
  return (
    <Key label="Hide the keyboard" className={cn("text-ink-muted", className)} onPress={onHide}>
      <KeyboardOff className="mx-auto h-5 w-5" aria-hidden="true" />
    </Key>
  );
}
