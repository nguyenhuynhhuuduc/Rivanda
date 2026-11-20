import { isConfigured } from "@/lib/oauth";
import { SocialButtonsClient } from "./SocialButtonsClient";

// Chỉ kiểm tra trạng thái cấu hình OAuth ở server; không bao giờ đưa Client ID/Secret xuống frontend.
export function SocialButtons({ next }: { next: string }) {
  return (
    <SocialButtonsClient
      next={next}
      googleEnabled={isConfigured("google")}
      facebookEnabled={isConfigured("facebook")}
    />
  );
}
