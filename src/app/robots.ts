import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/utils";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/account", "/cart", "/checkout", "/orders", "/track-order", "/api", "/dev", "/login", "/register", "/forgot-password", "/reset-password"],
      },
    ],
    sitemap: siteUrl("/sitemap.xml"),
  };
}
