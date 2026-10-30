"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId } from "react";
import { Select } from "@/components/ui/input";
import { SORT_OPTIONS } from "@/lib/catalog-types";

export function SortSelect({ value }: { value: string }) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    if (event.target.value === "featured") params.delete("sort");
    else params.set("sort", event.target.value);
    params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none">
      <label htmlFor={id} className="sr-only whitespace-nowrap text-sm text-ink-muted sm:not-sr-only">
        Sort by
      </label>
      <Select id={id} value={value} onChange={onChange} className="h-10 min-w-0 flex-1 lg:h-9 lg:w-auto lg:min-w-44 lg:flex-none">
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
