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
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="whitespace-nowrap text-sm text-ink-muted">
        Sort by
      </label>
      <Select id={id} value={value} onChange={onChange} className="h-9 w-auto min-w-44">
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
