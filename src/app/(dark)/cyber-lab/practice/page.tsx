import Link from "next/link";
import { PracticeWorkspace } from "@/components/cyber-lab/PracticeWorkspace";
import { Container, PageHeading } from "@/components/ui/kit";
import { requireUser } from "@/lib/auth";
import { returnPath } from "@/lib/url";

export const dynamic = "force-dynamic";
export const metadata = { title: "Practice | Cyber Lab", robots: { index: false, follow: false } };

export default async function PracticePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(returnPath("/cyber-lab/practice", await searchParams));
  return (
    <Container className="py-10 sm:py-14">
      <Link href="/cyber-lab" className="text-sm text-muted hover:text-fg">← Tài liệu Cyber Lab</Link>
      <div className="mt-6"><PageHeading eyebrow="Cyber Lab / Practice" title="Không gian thực hành" subtitle="Quản lý phiên Kali Simulator trong trình duyệt với IP ảo cố định theo tài khoản." /></div>
      <PracticeWorkspace ownerId={user.id} />
    </Container>
  );
}
