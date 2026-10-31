"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Settings for the counter device itself, kept on it through sign outs: the
 * on-screen keyboard (for touch screens with no keyboard) and full screen.
 * Storage can be blocked (private windows); the till then works without them.
 */

type DeviceSetting = "keyboard" | "fullScreen";

const KEYS: Record<DeviceSetting, string> = { keyboard: "boamah.till.device.keyboard", fullScreen: "boamah.till.device.fullScreen" };
const listeners = new Set<() => void>();

function readSetting(setting: DeviceSetting): boolean {
  try {
    return window.localStorage.getItem(KEYS[setting]) === "on";
  } catch {
    return false;
  }
}

export function setDeviceSetting(setting: DeviceSetting, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(KEYS[setting], "on");
    else window.localStorage.removeItem(KEYS[setting]);
  } catch {
    // Storage blocked: the setting lasts until the page is closed.
  }
  for (const listener of listeners) listener();
}

function subscribeToSettings(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || Object.values(KEYS).includes(event.key)) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDeviceSetting(setting: DeviceSetting): boolean {
  return useSyncExternalStore(subscribeToSettings, () => readSetting(setting), () => false);
}

// ---------------------------------------------------------------------------
// Full screen. Browsers only enter it from a tap or key press, and leave it on
// every full page load, so a device set to full screen goes back into it at
// the next touch.
// ---------------------------------------------------------------------------

function subscribeToFullScreen(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

/** Whether the till fills the screen, or null where the browser cannot (iPhones). */
export function useFullScreen(): boolean | null {
  return useSyncExternalStore(
    subscribeToFullScreen,
    () => (document.fullscreenEnabled ? document.fullscreenElement !== null : null),
    () => null,
  );
}

function enterFullScreen(): void {
  document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch((error: unknown) => {
    console.error("[till] full screen was refused", error);
  });
}

export function toggleFullScreen(): void {
  if (document.fullscreenElement) {
    setDeviceSetting("fullScreen", false);
    void document.exitFullscreen();
  } else {
    setDeviceSetting("fullScreen", true);
    enterFullScreen();
  }
}

/** On a device set to full screen, goes back into it at the first touch after a page load. */
export function useStayFullScreen(): void {
  const wanted = useDeviceSetting("fullScreen");
  useEffect(() => {
    if (!wanted || !document.fullscreenEnabled) return;
    function onFirstTouch() {
      if (!document.fullscreenElement) enterFullScreen();
    }
    // Leaving with Esc (or the browser's own bar) means the cashier wants it off.
    function onChange() {
      if (!document.fullscreenElement) setDeviceSetting("fullScreen", false);
    }
    window.addEventListener("pointerdown", onFirstTouch, { capture: true });
    window.addEventListener("keydown", onFirstTouch, { capture: true });
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      window.removeEventListener("pointerdown", onFirstTouch, { capture: true });
      window.removeEventListener("keydown", onFirstTouch, { capture: true });
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, [wanted]);
}
