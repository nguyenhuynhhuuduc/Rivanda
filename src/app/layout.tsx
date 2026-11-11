import type { Metadata } from "next";
import { DM_Serif_Display, Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import { getHomeSettings } from "@/lib/settings";
import { appUrl } from "@/lib/oauth";
import logo from "../../picture-title/logo-web.jpg";
import "./globals.css";

// Metadata/settings dùng runtime env và DB; không đóng băng giá trị fallback khi Docker build không có DB.
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--next-inter", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin", "vietnamese"], variable: "--next-playfair", display: "swap" });
const dmSerif = DM_Serif_Display({ subsets: ["latin", "latin-ext"], weight: "400", variable: "--next-dm-serif", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "vietnamese"], variable: "--next-jetbrains", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const s = await getHomeSettings();
  return {
    metadataBase: new URL(appUrl()),
    title: { default: s.siteName, template: `%s | ${s.siteName}` },
    description: s.heroSubtitle,
    icons: { icon: logo.src, apple: logo.src },
    openGraph: { siteName: s.siteName, type: "website", locale: "vi_VN" },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning className={`${inter.variable} ${playfair.variable} ${dmSerif.variable} ${mono.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('personal-site-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}})()` }} /></head>
      <body><a href="#main-content" className="skip-link">Đến nội dung chính</a>{children}</body>
    </html>
  );
}
