import Link from "next/link";
import { SocialIcons } from "@/components/SocialIcons";
import { btnOutline, btnPrimary, Container, PageHeading } from "@/components/ui/kit";
import { getHomeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giới thiệu" };

export default async function AboutPage() {
  const s = await getHomeSettings();
  return (
    <Container className="max-w-3xl py-16">
      <PageHeading eyebrow="Giới thiệu" title={s.siteName} subtitle={s.heroSubtitle} />
      <div className="space-y-5 text-lg leading-relaxed">
        {(s.aboutText || "Nội dung giới thiệu sẽ được cập nhật sớm.").split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-wrap">{p}</p>)}
      </div>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Link href="/contact" className={btnPrimary}>Liên hệ</Link>
        <Link href="/discovery" className={btnOutline}>Xem hành trình</Link>
        <SocialIcons instagramUrl={s.instagramUrl} xUrl={s.xUrl} facebookUrl={s.facebookUrl} />
      </div>
    </Container>
  );
}
