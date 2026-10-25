import type { Metadata } from "next";
import { PageHeader } from "@/components/store/page-header";
import { TrackOrderForm } from "@/components/store/track-order-form";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check the status of your order with The Boamah's Online Grocery Shop.",
  alternates: { canonical: "/track-order" },
};

export default async function TrackOrderPage({ searchParams }: PageProps<"/track-order">) {
  const params = await searchParams;
  const reference = typeof params.reference === "string" ? params.reference.slice(0, 40).toUpperCase() : "";
  return (
    <>
      <PageHeader
        title="Track your order"
        description="Enter your order reference and the email or phone number you used at checkout."
        crumbs={[{ href: "/", label: "Home" }, { label: "Track order" }]}
      />
      <div className="container-page max-w-xl">
        <TrackOrderForm initialReference={reference} />
      </div>
    </>
  );
}
