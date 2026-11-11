import { getCurrentUser } from "@/lib/auth";
import { PracticeSessionProvider } from "@/components/cyber-lab/PracticeSessionProvider";

export default async function CyberLabLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Từng page giữ guard + returnPath riêng; layout chỉ giữ RAM khi chuyển route nội bộ.
  return <PracticeSessionProvider key={user?.id ?? "guest"} ownerId={user?.id ?? ""}>{children}</PracticeSessionProvider>;
}
