import Link from "next/link";
import { Container } from "@/components/ui/kit";
import { Composer } from "@/components/discovery-community/Composer";
import { StorageMeter } from "@/components/discovery-community/StorageMeter";
import { requireUser } from "@/lib/auth";
import { communityReady, communityTopics } from "@/lib/discovery-community/read";
export const dynamic = "force-dynamic";
export const metadata = { title: "Tạo bài Discovery", robots: { index: false, follow: false } };
export default async function NewPost() { const user=await requireUser("/discovery/new"); const ready = await communityReady(); return <Container className="max-w-3xl py-12"><Link href="/discovery" className="text-sm text-link">← Về Newsfeed</Link><h1 className="mb-7 mt-5 font-display text-3xl font-bold">Chia sẻ với cộng đồng</h1>{ready ? <><StorageMeter actor={user}/><Composer topics={await communityTopics()} /></> : <p role="status">Discovery chưa khả dụng. Cần migration 007 được kiểm chứng.</p>}</Container>; }
