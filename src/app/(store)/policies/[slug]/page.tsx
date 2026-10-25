import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/feedback";
import { PageHeader } from "@/components/store/page-header";
import { PolicyText } from "@/components/store/policy-text";
import { formatMoney } from "@/lib/money";
import { isPolicySlug, POLICY_PAGES, policyText } from "@/lib/policies";
import { getActiveZones } from "@/server/delivery";
import { getStoreSettings } from "@/server/settings";

export async function generateMetadata({ params }: PageProps<"/policies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!isPolicySlug(slug)) return { title: "Not found" };
  const settings = await getStoreSettings();
  const published = Boolean(policyText(settings, slug));
  return {
    title: POLICY_PAGES[slug].title,
    alternates: { canonical: `/policies/${slug}` },
    robots: published ? undefined : { index: false, follow: true },
  };
}

export default async function PolicyPage({ params }: PageProps<"/policies/[slug]">) {
  const { slug } = await params;
  if (!isPolicySlug(slug)) notFound();
  const policy = POLICY_PAGES[slug];
  const [settings, zones] = await Promise.all([getStoreSettings(), slug === "delivery" ? getActiveZones() : Promise.resolve([])]);
  const body = policyText(settings, slug);

  return (
    <>
      <PageHeader title={policy.title} crumbs={[{ href: "/", label: "Home" }, { label: policy.title }]} />
      <div className="container-page max-w-3xl space-y-8">
        {body ? (
          <article className="prose-policy rounded-2xl border border-line bg-surface p-6 sm:p-10">
            <PolicyText text={body} />
          </article>
        ) : (
          <Alert tone="info" title="This page is being prepared">
            Our {policy.title.toLowerCase()} will be published here shortly. If you have a question in the meantime, please{" "}
            <Link href="/contact" className="font-semibold underline">
              contact us
            </Link>
            .
          </Alert>
        )}

        {slug === "delivery" ? (
          <section aria-labelledby="zones-title" className="rounded-lg border border-line bg-surface p-6 sm:p-8">
            <h2 id="zones-title" className="text-lg font-extrabold">
              Where we deliver
            </h2>
            {zones.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Delivery areas have not been published yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-line text-xs uppercase tracking-wider text-ink-subtle">
                    <tr>
                      <th scope="col" className="py-2 pr-4 font-semibold">Zone</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Fee</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Minimum order</th>
                      <th scope="col" className="py-2 font-semibold">Free delivery from</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {zones.map((zone) => (
                      <tr key={zone.id}>
                        <td className="py-3 pr-4">
                          <p className="font-semibold text-ink">{zone.name}</p>
                          <p className="text-xs text-ink-muted">{zone.region}{zone.areas.length ? ` · ${zone.areas.join(", ")}` : ""}</p>
                          {zone.estimatedDelivery ? <p className="text-xs text-ink-muted">{zone.estimatedDelivery}</p> : null}
                        </td>
                        <td className="py-3 pr-4 tabular-nums">{formatMoney(zone.feeMinor)}</td>
                        <td className="py-3 pr-4 tabular-nums">{zone.minOrderMinor > 0 ? formatMoney(zone.minOrderMinor) : "None"}</td>
                        <td className="py-3 tabular-nums">{zone.freeDeliveryThresholdMinor !== null ? formatMoney(zone.freeDeliveryThresholdMinor) : "Not offered"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {settings.pickupEnabled ? (
              <div className="mt-6 border-t border-line pt-5 text-sm">
                <h3 className="font-bold text-ink">Store pickup</h3>
                <p className="mt-1 whitespace-pre-line text-ink-muted">
                  {settings.pickupAddress ?? "Pickup is available. We confirm the pickup location with your order."}
                  {settings.pickupInstructions ? `\n${settings.pickupInstructions}` : ""}
                </p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </>
  );
}
