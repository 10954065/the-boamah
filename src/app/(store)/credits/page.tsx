import type { Metadata } from "next";
import Image from "next/image";
import credits from "@/data/image-credits.json";
import { PageHeader } from "@/components/store/page-header";

export const metadata: Metadata = {
  title: "Image credits",
  description: "Attribution for photographs used on The Boamah's Online Grocery Shop.",
  alternates: { canonical: "/credits" },
};

interface Credit {
  file: string;
  title: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  source: string;
  changes: string;
}

export default function CreditsPage() {
  const items = credits as Credit[];
  return (
    <>
      <PageHeader
        title="Image credits"
        description="Photographs are used under the licences shown below. Images uploaded by the store through the admin dashboard are not listed here."
        crumbs={[{ href: "/", label: "Home" }, { label: "Image credits" }]}
      />
      <div className="container-page">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((credit) => (
            <li key={credit.file} className="flex gap-3 rounded-lg border border-line bg-surface p-3 text-xs">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-soft">
                <Image src={credit.file} alt="" fill sizes="64px" className="object-cover" />
              </div>
              <div className="min-w-0 space-y-0.5 text-ink-muted">
                <a href={credit.source} target="_blank" rel="noopener noreferrer" className="line-clamp-2 font-semibold text-ink hover:text-brand-700">
                  {credit.title}
                </a>
                <p className="truncate">By {credit.author}</p>
                <p>
                  {credit.licenseUrl ? (
                    <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      {credit.license}
                    </a>
                  ) : (
                    credit.license
                  )}{" "}
                  · {credit.changes}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
