import Link from "next/link";
import { KaliDesktop } from "@/components/cyber-lab/KaliDesktop";
import { Container } from "@/components/ui/kit";
import { requireUser } from "@/lib/auth";
import { returnPath } from "@/lib/url";

export const dynamic = "force-dynamic";
export const metadata = { title: "Desktop | Cyber Lab", robots: { index: false, follow: false } };

export default async function DesktopPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(returnPath("/cyber-lab/desktop", await searchParams));
  return (
    <Container className="py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><Link href="/cyber-lab/practice" className="text-sm text-muted hover:text-fg">← Practice</Link><h1 className="mt-2 font-display text-2xl font-bold">Desktop thực hành</h1></div>
        <p className="text-xs text-muted">Kali Simulator · Dữ liệu chỉ trong RAM</p>
      </div>
      <KaliDesktop ownerId={user.id} />
    </Container>
  );
}
