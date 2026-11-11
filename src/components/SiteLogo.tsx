import Image from "next/image";
import logo from "../../picture-title/logo-web.jpg";

/** Một nguồn ảnh thương hiệu cho toàn bộ website, giữ đúng tỷ lệ ảnh gốc. */
export function SiteLogo({ name, className = "w-[60px]" }: { name: string; className?: string }) {
  // Optimizer không forward Basic auth vào subrequest. Staging đọc ảnh static qua cổng trực tiếp.
  return <Image src={logo} alt={name} unoptimized={process.env.APP_ENV === "staging"} sizes="(max-width: 767px) 60px, 84px" className={`h-auto shrink-0 rounded-md ${className}`} />;
}
