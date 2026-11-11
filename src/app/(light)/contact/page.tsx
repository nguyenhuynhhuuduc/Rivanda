import { SocialIcons } from "@/components/SocialIcons";
import { Container, PageHeading } from "@/components/ui/kit";
import { getHomeSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Liên hệ" };

export default async function ContactPage() {
  const s = await getHomeSettings();
  const hasSocial = s.instagramUrl || s.xUrl || s.facebookUrl;
  return (
    <Container className="max-w-3xl py-16">
      <PageHeading eyebrow="Liên hệ" title="Hãy kết nối" subtitle="Muốn hợp tác, hỏi về một bài viết hay chỉ chào một tiếng, cứ nhắn cho tôi." />
      <div className="space-y-8">
        {s.contactEmail && (
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-link">Email</p>
            <a href={`mailto:${s.contactEmail}`} className="mt-2 block font-display text-2xl font-bold hover:text-link">{s.contactEmail}</a>
          </div>
        )}
        {hasSocial && (
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-link">Mạng xã hội</p>
            <div className="mt-2"><SocialIcons instagramUrl={s.instagramUrl} xUrl={s.xUrl} facebookUrl={s.facebookUrl} /></div>
          </div>
        )}
        {!s.contactEmail && !hasSocial && <p className="text-muted">Thông tin liên hệ sẽ được cập nhật sớm.</p>}
      </div>
    </Container>
  );
}
