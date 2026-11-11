import { SiteShell } from "@/components/site/SiteShell";

// Cyber Lab cũng tôn trọng lựa chọn theme toàn website.
export default function DarkLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
