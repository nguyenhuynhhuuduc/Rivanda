import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (process.env.APP_ENV === "staging") return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/cyber-lab", "/admin", "/account", "/api/", "/login", "/register", "/reset-password"] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
