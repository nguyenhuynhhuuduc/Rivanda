import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotoGrid } from "@/components/site/PhotoTile";
import { Avatar, btnOutline, btnPrimary, Container, Empty, SectionHeading } from "@/components/ui/kit";
import { getCurrentUser } from "@/lib/auth";
import { followCounts, isFollowing } from "@/lib/community";
import { listPhotos, PUBLIC } from "@/lib/discovery";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
import { getPublicProfile } from "@/lib/users";
import { toggleFollowAction } from "../actions";
import { ProfilePosts } from "@/components/discovery-community/ProfilePosts";

export const dynamic = "force-dynamic";
const ID_RE = /^[a-f0-9-]{36}$/;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = ID_RE.test(id) ? await getPublicProfile(id) : null;
  return { title: p?.displayName ?? "Thành viên" };
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) notFound();
  const profile = await getPublicProfile(id);
  if (!profile) notFound();

  const me = await getCurrentUser();
  const [counts, following, { photos }] = await Promise.all([
    followCounts(id),
    me ? isFollowing(me.id, id) : Promise.resolve(false),
    listPhotos({ statuses: PUBLIC, uploaderId: id, limit: 48 }),
  ]);

  return (
    <Container className="py-14">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <Avatar name={profile.displayName} url={profile.avatarUrl} size={96} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-4xl font-bold tracking-tight">{profile.displayName}</h1>
          <p className="mt-1 text-sm text-muted">{ROLE_LABEL[profile.role]} · Tham gia {formatDate(profile.createdAt)} · {counts.followers} người theo dõi · {counts.following} đang theo dõi</p>
          {profile.bio && <p className="mt-3 max-w-2xl leading-relaxed">{profile.bio}</p>}
        </div>
        {me?.id !== id && (
          <form action={toggleFollowAction.bind(null, id)}>
            <button className={following ? btnOutline : btnPrimary}>{following ? "Đang theo dõi" : "Theo dõi"}</button>
          </form>
        )}
      </div>

      <ProfilePosts id={id} own={me?.id === id} />
      <section className="mt-14">
        <SectionHeading eyebrow="Ảnh" title="Ảnh đã đăng" />
        {photos.length ? <PhotoGrid photos={photos} /> : <Empty>Thành viên này chưa đăng ảnh nào.</Empty>}
      </section>
    </Container>
  );
}
