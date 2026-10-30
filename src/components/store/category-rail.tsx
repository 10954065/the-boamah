"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** The swipeable row of categories. Opens with the current one in the middle, however far along it sits. */
export function CategoryRail({ activeKey, children }: { activeKey: string; children: ReactNode }) {
  const railRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    const current = rail?.querySelector<HTMLElement>('[aria-current="page"]');
    if (rail && current) rail.scrollLeft = current.offsetLeft - (rail.clientWidth - current.offsetWidth) / 2;
  }, [activeKey]);

  return (
    <ul ref={railRef} className="relative flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:px-6">
      {children}
    </ul>
  );
}
