-- ISOLATED TESTED / NOT APPLIED TO MAIN. MySQL >= 8.0.16, InnoDB, utf8mb4_unicode_ci.
-- Only an isolated test schema after preflight and explicit approval.
-- No USE, no ALTER of shared posts/users, no automatic runner registration.
-- Stop on the FIRST error. DDL auto-commits: see CONTENT_RESTRUCTURE_PLAN.md.

CREATE TABLE blog_foundation_state (
  singleton_id TINYINT UNSIGNED NOT NULL,
  migration_version SMALLINT UNSIGNED NOT NULL,
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (singleton_id),
  CONSTRAINT ck_blog_foundation_singleton CHECK (singleton_id = 1),
  CONSTRAINT ck_blog_foundation_version CHECK (migration_version = 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blog_topics (
  id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_blog_topics_slug (slug),
  KEY idx_blog_topics_public (is_visible, deleted_at, sort_order, id),
  CONSTRAINT ck_blog_topics_visible CHECK (is_visible IN (0, 1)),
  CONSTRAINT ck_blog_topics_order CHECK (sort_order >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blog_post_details (
  post_id CHAR(36) NOT NULL,
  topic_id CHAR(36) NULL,
  workflow_state ENUM('draft','pending','published','rejected','hidden','deleted') NOT NULL DEFAULT 'draft',
  revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
  reviewed_revision BIGINT UNSIGNED NULL,
  reviewed_by CHAR(36) NULL,
  reviewed_at TIMESTAMP NULL,
  review_note VARCHAR(500) NULL,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id),
  KEY idx_blog_details_topic (topic_id, workflow_state, post_id),
  KEY idx_blog_details_review (workflow_state, updated_at, post_id),
  CONSTRAINT fk_blog_details_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_blog_details_topic FOREIGN KEY (topic_id) REFERENCES blog_topics(id) ON DELETE SET NULL,
  CONSTRAINT fk_blog_details_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT ck_blog_details_revision CHECK (revision >= 1 AND (reviewed_revision IS NULL OR reviewed_revision <= revision))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blog_review_events (
  id CHAR(36) NOT NULL,
  post_id CHAR(36) NOT NULL,
  actor_id CHAR(36) NULL,
  revision BIGINT UNSIGNED NOT NULL,
  decision ENUM('submitted','approved','rejected','hidden','deleted','restored') NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_blog_events_post (post_id, created_at, id),
  CONSTRAINT fk_blog_events_post FOREIGN KEY (post_id) REFERENCES blog_post_details(post_id) ON DELETE CASCADE,
  CONSTRAINT fk_blog_events_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT ck_blog_events_revision CHECK (revision >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shared content rate limits are needed already for Blog submissions, before 007.
CREATE TABLE content_rate_buckets (
  user_id CHAR(36) NOT NULL,
  action_kind ENUM('blog_submit','community_submit','comment','report','media_upload') NOT NULL,
  window_start TIMESTAMP NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action_kind, window_start),
  CONSTRAINT fk_content_rate_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

START TRANSACTION;
INSERT INTO blog_topics (id, name, slug, sort_order) VALUES
('60000000-0000-4000-8000-000000000001', 'Kinh nghiệm du lịch', 'kinh-nghiem-du-lich', 10),
('60000000-0000-4000-8000-000000000002', 'Nấu ăn', 'nau-an', 20),
('60000000-0000-4000-8000-000000000003', 'Đời sống', 'doi-song', 30),
('60000000-0000-4000-8000-000000000004', 'Làm đẹp', 'lam-dep', 40),
('60000000-0000-4000-8000-000000000005', 'Sức khỏe', 'suc-khoe', 50);

-- Only blog records; do not invent a topic/approval actor or alter old content.
INSERT INTO blog_post_details (post_id, workflow_state, created_at, updated_at)
SELECT id, CASE WHEN status = 'published' THEN 'published' ELSE 'draft' END, created_at, updated_at
FROM posts WHERE type = 'blog';
-- Readiness marker commits ONLY together with successful seed/backfill.
INSERT INTO blog_foundation_state(singleton_id,migration_version) VALUES(1,6);
COMMIT;

-- Read-only postflight; the runner/reviewer MUST require zero mismatches.
SELECT COUNT(*) AS missing_blog_details FROM posts p
LEFT JOIN blog_post_details b ON b.post_id = p.id WHERE p.type = 'blog' AND b.post_id IS NULL;
SELECT COUNT(*) AS wrong_post_type FROM blog_post_details b JOIN posts p ON p.id = b.post_id WHERE p.type <> 'blog';
SELECT COUNT(*) AS changed_legacy_state FROM blog_post_details b JOIN posts p ON p.id = b.post_id
WHERE b.workflow_state <> CASE WHEN p.status = 'published' THEN 'published' ELSE 'draft' END;
