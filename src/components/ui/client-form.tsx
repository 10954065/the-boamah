"use client";

import { useSyncExternalStore, type ComponentProps } from "react";

const subscribe = () => () => {};

/** False during server render and hydration, true once React runs on the client. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * A form for react-hook-form screens. Its controls stay disabled until
 * hydration: these forms submit through JavaScript, and react-hook-form writes
 * its default values into the inputs when it mounts, so anything typed earlier
 * on a slow connection would otherwise be silently replaced.
 */
export function ClientForm({ children, ...props }: ComponentProps<"form">) {
  const hydrated = useHydrated();
  return (
    <form {...props} aria-busy={hydrated ? undefined : true}>
      <fieldset disabled={!hydrated} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
