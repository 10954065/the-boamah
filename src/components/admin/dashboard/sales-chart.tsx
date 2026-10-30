"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { compactCedis, scaleTicks } from "@/lib/dashboard";
import { formatMoney } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";

export interface SalesDay {
  day: string;
  websiteMinor: number;
  tillMinor: number;
  orders: number;
}

/** Website first, till second: the order the shop's colours were checked in for colour blindness. */
const SERIES = [
  { key: "websiteMinor", label: "Website orders paid", short: "website", swatch: "bg-brand-500" },
  { key: "tillMinor", label: "Shop till sales", short: "till", swatch: "bg-gold-500" },
] as const;

/** Below this the scale still runs to GH₵100, so an empty period does not draw a scale of pesewas. */
const SMALLEST_SCALE_MINOR = 10_000;
const PLOT_HEIGHT = "h-56";

function shortDay(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** Paid sales per day as columns, website and till stacked, with a readout for the day under the pointer or keyboard. */
export function SalesChart({ days, showTill }: { days: readonly SalesDay[]; showTill: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();
  const series = showTill ? SERIES : SERIES.slice(0, 1);
  const totalOf = (day: SalesDay) => day.websiteMinor + (showTill ? day.tillMinor : 0);
  const ticks = scaleTicks(Math.max(SMALLEST_SCALE_MINOR, ...days.map(totalOf)));
  const top = ticks.at(-1)!;
  const pick = active === null ? null : days[active];
  const lastIndex = days.length - 1;
  const labelled = new Set([0, Math.floor(lastIndex / 2), lastIndex]);

  function pointAt(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.floor(((event.clientX - box.left) / box.width) * days.length);
    setActive(Math.min(lastIndex, Math.max(0, index)));
  }

  function step(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -days.length, End: days.length };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setActive((current) => Math.min(lastIndex, Math.max(0, (current ?? lastIndex) + moves[event.key]!)));
  }

  return (
    <figure className="m-0">
      {showTill ? (
        <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px]" aria-label="Legend">
          {series.map((item) => (
            <li key={item.key} className="flex items-center gap-2">
              <span aria-hidden="true" className={cn("h-3 w-3 rounded-[3px]", item.swatch)} />
              <span className="font-semibold text-ink-muted">{item.label}</span>
              <span className="font-bold text-ink">{formatMoney(days.reduce((sum, day) => sum + day[item.key], 0))}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <div aria-hidden="true" className={cn("relative w-14 shrink-0", PLOT_HEIGHT)}>
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 translate-y-1/2 text-[11px] font-semibold tabular-nums text-ink-subtle" style={{ bottom: `${(tick / top) * 100}%` }}>
              {compactCedis(tick)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            role="group"
            tabIndex={0}
            aria-label={`Sales per day for the last ${days.length} days. Use the arrow keys to read each day, or open the table below.`}
            onPointerMove={pointAt}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive((current) => current ?? lastIndex)}
            onBlur={() => setActive(null)}
            onKeyDown={step}
            className={cn("relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-4", PLOT_HEIGHT)}
          >
            {ticks.map((tick) => (
              <span
                key={tick}
                aria-hidden="true"
                className={cn("absolute inset-x-0 h-px", tick === 0 ? "bg-line-strong" : "bg-line/70")}
                style={{ bottom: `${(tick / top) * 100}%` }}
              />
            ))}
            <div aria-hidden="true" className="absolute inset-0 flex items-end">
              {days.map((day, index) => {
                const website = (day.websiteMinor / top) * 100;
                const till = showTill ? (day.tillMinor / top) * 100 : 0;
                return (
                  <div key={day.day} className={cn("flex h-full flex-1 flex-col items-center justify-end px-px transition-colors", active === index && "bg-brand-50/80")}>
                    <div className="flex w-full max-w-6 flex-col justify-end gap-[2px]" style={{ height: `${website + till}%` }}>
                      {till > 0 ? <div className="w-full shrink-0 rounded-t-[4px] bg-gold-500" style={{ height: `${(till / (website + till)) * 100}%` }} /> : null}
                      {website > 0 ? <div className={cn("w-full grow bg-brand-500", till > 0 ? "" : "rounded-t-[4px]")} /> : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {pick ? (
              <div
                role="status"
                className="pointer-events-none absolute top-1 z-10 w-max min-w-44 -translate-x-1/2 rounded-xl border border-line bg-surface/95 px-3.5 py-2.5 text-left shadow-[var(--shadow-raised)] backdrop-blur-sm"
                style={{ left: `clamp(5.5rem, ${((active! + 0.5) / days.length) * 100}%, calc(100% - 5.5rem))` }}
              >
                <p className="text-[12px] font-semibold text-ink-muted">{formatDate(pick.day)}</p>
                <ul className="mt-1.5 space-y-1">
                  {series.map((item) => (
                    <li key={item.key} className="flex items-center gap-2 text-[13px]">
                      <span aria-hidden="true" className={cn("h-[3px] w-3 rounded-full", item.swatch)} />
                      <span className="font-extrabold text-ink">{formatMoney(pick[item.key])}</span>
                      <span className="text-ink-muted">{item.short}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 border-t border-line pt-1.5 text-[12px] text-ink-muted">
                  {pick.orders} website order{pick.orders === 1 ? "" : "s"} placed
                </p>
              </div>
            ) : null}
          </div>

          <div aria-hidden="true" className="relative mt-2 h-4 text-[11px] font-semibold text-ink-subtle">
            {days.map((day, index) =>
              labelled.has(index) ? (
                <span
                  key={day.day}
                  className={cn("absolute whitespace-nowrap", index === 0 ? "left-0" : index === lastIndex ? "right-0" : "-translate-x-1/2")}
                  style={index === 0 || index === lastIndex ? undefined : { left: `${((index + 0.5) / days.length) * 100}%` }}
                >
                  {index === lastIndex ? "Today" : shortDay(day.day)}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer select-none text-[13px] font-bold text-brand-700 hover:underline">Show as a table</summary>
        <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-line">
          <table id={tableId} className="w-full text-[13px]">
            <caption className="sr-only">Sales per day</caption>
            <thead className="sticky top-0 bg-soft">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-bold text-ink-muted">Day</th>
                {series.map((item) => (
                  <th key={item.key} scope="col" className="px-3 py-2 text-right font-bold text-ink-muted">{item.label}</th>
                ))}
                <th scope="col" className="px-3 py-2 text-right font-bold text-ink-muted">Website orders</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {days.toReversed().map((day) => (
                <tr key={day.day}>
                  <th scope="row" className="px-3 py-1.5 text-left font-semibold">{formatDate(day.day)}</th>
                  {series.map((item) => (
                    <td key={item.key} className="px-3 py-1.5 text-right tabular-nums">{formatMoney(day[item.key])}</td>
                  ))}
                  <td className="px-3 py-1.5 text-right tabular-nums">{day.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
