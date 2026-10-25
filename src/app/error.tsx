"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

/** Route error boundary: no stack traces or internals are shown to customers. */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-xl rounded-lg border border-line bg-surface">
        <EmptyState
          icon={<TriangleAlert />}
          title="Something went wrong"
          description={
            <>
              Please try again. If the problem continues, contact us{error.digest ? <> and mention reference <code className="font-mono">{error.digest}</code></> : null}.
            </>
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={reset}>
                <RotateCcw /> Try again
              </Button>
              <Link href="/" className={buttonVariants({ variant: "outline" })}>
                Go to homepage
              </Link>
            </div>
          }
        />
      </div>
    </div>
  );
}
