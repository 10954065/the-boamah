import { Skeleton } from "@/components/ui/feedback";

export default function StoreLoading() {
  return (
    <div className="container-page pt-8" role="status" aria-label="Loading">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-8 w-72" />
      <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i} className="rounded-lg border border-line bg-surface p-3">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="mt-3 h-3 w-16" />
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-3 h-8 w-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}
