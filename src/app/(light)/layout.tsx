import { SiteShell } from "@/components/site/SiteShell";

// Theme dùng chung được chọn ở root, giữ nguyên qua các khu vực.
export default function LightLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
