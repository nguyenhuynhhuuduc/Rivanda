import { cache } from "react";
import type { RowDataPacket } from "mysql2";
import { pool } from "../db";
import { CommunityError } from "./model";
const columns: Record<string, string[]> = {
  community_schema_state: ["singleton_id", "migration_version", "application_revision"],
  community_upload_batches: ["id", "owner_id", "byte_size", "manifest", "attached_post_id", "released_bytes", "inventory_complete", "lease_until", "purge_after"],
  community_storage_files: ["file_name", "batch_id", "owner_id", "byte_size", "sha256", "state", "delete_after", "gc_token", "gc_lease_until"],
  community_rate_buckets: ["user_id", "action_kind", "window_start", "hits"],
  community_topics: ["id", "slug", "name", "is_visible", "deleted_at"],
  community_posts: ["id", "author_id", "topic_id", "body", "kind", "title", "visibility", "status", "revision", "moderation_hold", "published_at", "deleted_at", "restore_status", "purge_started_at", "purged_at"],
  community_media: ["id", "post_id", "owner_id", "image_file", "thumb_file", "width", "height", "sort_order", "removed_at", "purge_after", "active_order"],
  community_post_tags: ["post_id", "tag_id"], community_likes: ["post_id", "user_id"], community_saves: ["post_id", "user_id"],
  community_comments: ["id", "post_id", "user_id", "parent_id", "depth", "parent_depth", "request_id", "revision", "moderation_hold", "status", "body"],
  community_comment_events: ["id", "comment_id", "actor_id", "revision", "decision"],
  community_reports: ["id", "reporter_id", "post_id", "comment_id", "open_target", "status", "decision", "resolution_note"],
  community_review_events: ["id", "post_id", "actor_id", "revision", "decision"],
};
export const communityReady = cache(async (): Promise<boolean> => {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT TABLE_NAME AS t,COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?)", [Object.keys(columns)]);
  const available = new Set(rows.map(r => `${r.t}.${r.c}`));
  if (!Object.entries(columns).every(([t, cs]) => cs.every(c => available.has(`${t}.${c}`)))) return false;
  const [state] = await pool.query<RowDataPacket[]>("SELECT migration_version,application_revision FROM community_schema_state WHERE singleton_id=1");
  return state[0]?.migration_version === 7 && state[0]?.application_revision === 3;
});
export async function requireCommunity(): Promise<void> { if (!await communityReady()) throw new CommunityError("Discovery chưa khả dụng: cần migration 007 được áp dụng và kiểm chứng."); }
