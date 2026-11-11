-- PROPOSED / NOT APPLIED. Independent community domain, never reuse photos/trips.
-- Standalone: requires users/tags only, NOT migration 006. Stop on first error.
-- No seed posts/users, triggers, ALTER, network operations or runner changes.

CREATE TABLE community_schema_state (
  singleton_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  migration_version SMALLINT UNSIGNED NOT NULL,
  application_revision SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  completed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT ck_community_schema_singleton CHECK (singleton_id = 1),
  CONSTRAINT ck_community_schema_version CHECK (migration_version = 7 AND application_revision = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_rate_buckets (
  user_id CHAR(36) NOT NULL,
  action_kind ENUM('post','upload','comment','report','interaction') NOT NULL,
  window_start TIMESTAMP NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action_kind, window_start),
  CONSTRAINT fk_community_rate_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_topics (
  id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_community_topics_slug (slug),
  CONSTRAINT ck_community_topics_visible CHECK (is_visible IN (0, 1)),
  CONSTRAINT ck_community_topics_order CHECK (sort_order >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_posts (
  id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  topic_id CHAR(36) NULL,
  kind ENUM('status','article','photos') NOT NULL,
  title VARCHAR(200) NULL,
  body MEDIUMTEXT NOT NULL,
  visibility ENUM('public','private') NOT NULL DEFAULT 'public',
  status ENUM('draft','pending','published','rejected','hidden','deleted') NOT NULL DEFAULT 'draft',
  revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
  moderation_hold TINYINT(1) NOT NULL DEFAULT 0,
  reviewed_revision BIGINT UNSIGNED NULL,
  reviewed_by CHAR(36) NULL,
  review_note VARCHAR(500) NULL,
  published_at TIMESTAMP(6) NULL,
  deleted_at TIMESTAMP(6) NULL,
  restore_status ENUM('draft','pending','published','rejected','hidden') NULL,
  purge_started_at TIMESTAMP(6) NULL,
  purged_at TIMESTAMP(6) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_community_post_owner (id, author_id),
  KEY idx_community_feed (status, visibility, published_at, id),
  KEY idx_community_author (author_id, status, created_at, id),
  KEY idx_community_topic (topic_id, status, published_at, id),
  KEY idx_community_post_retention (status, deleted_at, id),
  CONSTRAINT fk_community_posts_author FOREIGN KEY (author_id) REFERENCES users(id),
  CONSTRAINT fk_community_posts_topic FOREIGN KEY (topic_id) REFERENCES community_topics(id) ON DELETE SET NULL,
  CONSTRAINT fk_community_posts_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT ck_community_revision CHECK (revision >= 1 AND (reviewed_revision IS NULL OR reviewed_revision <= revision)),
  CONSTRAINT ck_community_moderation_hold CHECK (moderation_hold IN (0,1)),
  CONSTRAINT ck_community_status_length CHECK (kind <> 'status' OR CHAR_LENGTH(body) <= 1000),
  CONSTRAINT ck_community_article_title CHECK (kind <> 'article' OR status NOT IN ('published','pending') OR (title IS NOT NULL AND CHAR_LENGTH(TRIM(title)) > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_media (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  image_file VARCHAR(80) NOT NULL,
  thumb_file VARCHAR(80) NULL,
  medium_file VARCHAR(80) NULL,
  mime_type ENUM('image/jpeg','image/png','image/webp') NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  width INT UNSIGNED NOT NULL,
  height INT UNSIGNED NOT NULL,
  sort_order INT UNSIGNED NOT NULL,
  removed_at TIMESTAMP(6) NULL,
  purge_after TIMESTAMP(6) NULL,
  active_order INT UNSIGNED GENERATED ALWAYS AS (CASE WHEN removed_at IS NULL THEN sort_order ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_community_media_order (post_id, active_order),
  KEY idx_community_media_retention (purge_after, id),
  KEY idx_community_media_thumb (thumb_file),
  UNIQUE KEY uq_community_media_original (image_file),
  CONSTRAINT fk_community_media_owner FOREIGN KEY (post_id, owner_id) REFERENCES community_posts(id, author_id),
  CONSTRAINT ck_community_media_size CHECK (byte_size > 0 AND byte_size <= 8388608 AND width > 0 AND height > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Count all reserved/written WebP bytes, including thumbnails and retained orphans.
-- Refund only after the fenced worker confirms filesystem absence; DB/FS are not atomic.
CREATE TABLE community_upload_batches (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  released_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  inventory_complete TINYINT(1) NOT NULL DEFAULT 0,
  lease_until TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  purge_after TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  manifest JSON NULL,
  attached_post_id CHAR(36) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_community_upload_owner (id, owner_id),
  KEY idx_community_upload_owner (owner_id, byte_size),
  CONSTRAINT fk_community_upload_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  CONSTRAINT fk_community_upload_post FOREIGN KEY (attached_post_id) REFERENCES community_posts(id),
  CONSTRAINT ck_community_upload_bytes CHECK (byte_size > 0 AND byte_size <= 104857600 AND released_bytes <= byte_size AND inventory_complete IN (0,1)),
  CONSTRAINT ck_community_upload_manifest CHECK (manifest IS NULL OR JSON_TYPE(manifest) = 'ARRAY')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_storage_files (
  file_name VARCHAR(80) NOT NULL PRIMARY KEY,
  batch_id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  state ENUM('reserved','stored','deleting','deleted') NOT NULL DEFAULT 'reserved',
  stored_at TIMESTAMP(6) NULL,
  delete_after TIMESTAMP(6) NULL,
  deleted_at TIMESTAMP(6) NULL,
  gc_token CHAR(36) NULL,
  gc_lease_until TIMESTAMP(6) NULL,
  last_error VARCHAR(40) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_community_file_owner (owner_id),
  KEY idx_community_file_batch (batch_id, state),
  KEY idx_community_file_cleanup (state, delete_after, file_name),
  CONSTRAINT fk_community_file_batch FOREIGN KEY (batch_id,owner_id) REFERENCES community_upload_batches(id,owner_id),
  CONSTRAINT fk_community_file_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  CONSTRAINT ck_community_file_bytes CHECK (byte_size > 0 AND byte_size <= 5242880)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_post_tags (
  post_id CHAR(36) NOT NULL,
  tag_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  KEY idx_community_tag_posts (tag_id, post_id),
  CONSTRAINT fk_community_tags_post FOREIGN KEY (post_id) REFERENCES community_posts(id),
  CONSTRAINT fk_community_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_likes (
  user_id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id, post_id),
  KEY idx_community_likes_post (post_id, created_at),
  CONSTRAINT fk_community_likes_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_community_likes_post FOREIGN KEY (post_id) REFERENCES community_posts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_saves (
  user_id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id, post_id),
  KEY idx_community_saves_post (post_id),
  CONSTRAINT fk_community_saves_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_community_saves_post FOREIGN KEY (post_id) REFERENCES community_posts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_comments (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  parent_id CHAR(36) NULL,
  depth TINYINT UNSIGNED NOT NULL DEFAULT 1,
  parent_depth TINYINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN parent_id IS NULL THEN NULL ELSE 1 END) STORED,
  user_id CHAR(36) NOT NULL,
  request_id CHAR(36) NULL,
  body VARCHAR(2000) NOT NULL,
  status ENUM('visible','hidden','deleted') NOT NULL DEFAULT 'visible',
  moderation_hold TINYINT(1) NOT NULL DEFAULT 0,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_community_comment_post (id, post_id, depth),
  UNIQUE KEY uq_community_comment_request (user_id, request_id),
  KEY idx_community_comments_page (post_id, status, created_at, id),
  KEY idx_community_comments_parent (parent_id, post_id),
  CONSTRAINT fk_community_comments_post FOREIGN KEY (post_id) REFERENCES community_posts(id),
  CONSTRAINT fk_community_comments_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_community_comments_parent FOREIGN KEY (parent_id, post_id, parent_depth) REFERENCES community_comments(id, post_id, depth),
  CONSTRAINT ck_community_comment_depth CHECK ((parent_id IS NULL AND depth = 1) OR (parent_id IS NOT NULL AND depth = 2)),
  CONSTRAINT ck_community_comment_revision CHECK (revision >= 1),
  CONSTRAINT ck_community_comment_hold CHECK (moderation_hold IN (0,1)),
  CONSTRAINT ck_community_comments_parent CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT ck_community_comments_body CHECK (CHAR_LENGTH(TRIM(body)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_comment_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  comment_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NULL,
  revision BIGINT UNSIGNED NOT NULL,
  decision ENUM('edited','deleted','hidden') NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_community_comment_history (comment_id, created_at, id),
  CONSTRAINT fk_community_comment_event_comment FOREIGN KEY (comment_id) REFERENCES community_comments(id),
  CONSTRAINT fk_community_comment_event_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_reports (
  id CHAR(36) NOT NULL,
  reporter_id CHAR(36) NOT NULL,
  post_id CHAR(36) NULL,
  comment_id CHAR(36) NULL,
  reason VARCHAR(500) NOT NULL,
  status ENUM('open','resolved','dismissed') NOT NULL DEFAULT 'open',
  open_target VARCHAR(40) GENERATED ALWAYS AS (
    CASE WHEN status = 'open' THEN COALESCE(CONCAT('p:', post_id), CONCAT('c:', comment_id)) ELSE NULL END
  ) STORED,
  handled_by CHAR(36) NULL,
  decision ENUM('dismiss','hide_post','remove_post','hide_comment') NULL,
  resolution_note VARCHAR(500) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  handled_at TIMESTAMP(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_community_open_report (reporter_id, open_target),
  KEY idx_community_reports_queue (status, created_at, id),
  KEY idx_community_reporter_day (reporter_id, created_at),
  CONSTRAINT fk_community_reports_user FOREIGN KEY (reporter_id) REFERENCES users(id),
  CONSTRAINT fk_community_reports_post FOREIGN KEY (post_id) REFERENCES community_posts(id),
  CONSTRAINT fk_community_reports_comment FOREIGN KEY (comment_id) REFERENCES community_comments(id),
  CONSTRAINT fk_community_reports_handler FOREIGN KEY (handled_by) REFERENCES users(id),
  CONSTRAINT ck_community_report_target CHECK ((post_id IS NOT NULL AND comment_id IS NULL) OR (post_id IS NULL AND comment_id IS NOT NULL)),
  CONSTRAINT ck_community_report_reason CHECK (CHAR_LENGTH(TRIM(reason)) > 0),
  CONSTRAINT ck_community_report_resolution CHECK ((status = 'open' AND decision IS NULL AND handled_at IS NULL) OR (status <> 'open' AND decision IS NOT NULL AND handled_at IS NOT NULL AND handled_by IS NOT NULL AND resolution_note IS NOT NULL AND CHAR_LENGTH(TRIM(resolution_note)) > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_review_events (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NULL,
  revision BIGINT UNSIGNED NOT NULL,
  decision ENUM('submitted','published','edited','approved','rejected','hidden','deleted','restored','purge_started','purged') NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_community_review_post (post_id, created_at, id),
  CONSTRAINT fk_community_review_post FOREIGN KEY (post_id) REFERENCES community_posts(id),
  CONSTRAINT fk_community_review_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT ck_community_review_revision CHECK (revision >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- No fake community content. Application still needs ACL, rate-limit transactions,
-- revision CAS, media visibility, aggregate query limits and input validation.
START TRANSACTION;
INSERT INTO community_topics(id,name,slug,sort_order) VALUES
('70000000-0000-4000-8000-000000000001','Chia sẻ chung','chia-se-chung',10),
('70000000-0000-4000-8000-000000000002','Hỏi đáp','hoi-dap',20),
('70000000-0000-4000-8000-000000000003','Trải nghiệm','trai-nghiem',30);
INSERT INTO community_schema_state(singleton_id,migration_version) VALUES(1,7);
COMMIT;
