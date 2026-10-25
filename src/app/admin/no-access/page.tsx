import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export const metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <div className="rounded-lg border border-line bg-surface">
      <EmptyState
        icon={<ShieldAlert />}
        title="You don't have access to this area"
        description="Your role doesn't include permission for that page. Ask a Super Admin if you need access."
        action={
          <Link href="/admin" className={buttonVariants()}>
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
