import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/kit";
import { Composer } from "@/components/discovery-community/Composer";
import { DeletePost } from "@/components/discovery-community/ManageForms";
import { StorageMeter } from "@/components/discovery-community/StorageMeter";
import {RemovedImages} from "@/components/discovery-community/RetentionViews";
import { requireUser } from "@/lib/auth";
import { getCommunityPost, communityTopics } from "@/lib/discovery-community/read";
import { PostStateBadge, PostStateNotice } from "@/components/discovery-community/DiscoveryUI";
import styles from "@/components/discovery-community/Discovery.module.css";
import { UUID } from "@/lib/discovery-community/model";
export const dynamic = "force-dynamic";
export const metadata = { title: "Chỉnh sửa bài Discovery", robots: { index: false, follow: false } };
export default async function EditPost({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<{removed?:string}> }) { const { id } = await params; if (!UUID.test(id)) notFound(); const user = await requireUser(`/discovery/posts/${id}/edit`), post = await getCommunityPost(id, user); if (!post || post.authorId !== user.id) notFound(); return <Container className={`${styles.scope} max-w-3xl py-8 sm:py-12`}><Link className="text-sm text-link" href={`/discovery/posts/${id}`}>← Xem bài</Link><h1 className="mb-3 mt-5 font-display text-3xl font-bold">Chỉnh sửa bài Discovery</h1><div className="mb-6 space-y-2"><PostStateBadge status={post.status} visibility={post.visibility}/><PostStateNotice status={post.status} visibility={post.visibility}/>{post.reviewNote&&<p className="break-words text-sm text-muted">Lý do kiểm duyệt: {post.reviewNote}</p>}</div><StorageMeter actor={user}/><Composer post={post} topics={await communityTopics()} /><RemovedImages actor={user} postId={id} revision={post.revision} cursor={(await searchParams).removed}/><DeletePost id={id} revision={post.revision} /></Container>; }
