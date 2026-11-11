-- DRAFT / QA ONLY. Requires verified 004 notifications + 007 revision 3; no 006 dependency.
-- MySQL 8.0.16+. No USE, drops, backfill, data deletion, or automatic rerun.
-- DDL auto-commits: a missing final marker means STOP and inspect, not rerun.
ALTER TABLE notifications
  ADD COLUMN actor_id CHAR(36) NULL,
  ADD COLUMN community_post_id CHAR(36) NULL,
  ADD COLUMN community_comment_id CHAR(36) NULL,
  ADD COLUMN dedupe_key CHAR(64) NULL,
  ADD UNIQUE KEY uq_notifications_dedupe (dedupe_key),
  ADD KEY idx_notifications_actor_time (actor_id, created_at, user_id),
  ADD KEY idx_notifications_page (user_id, created_at, id),
  ADD CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_notifications_post FOREIGN KEY (community_post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_notifications_comment FOREIGN KEY (community_comment_id) REFERENCES community_comments(id) ON DELETE CASCADE,
  ADD CONSTRAINT ck_notifications_discovery CHECK (
    (LEFT(type,10)<>'discovery_' AND actor_id IS NULL AND community_post_id IS NULL AND community_comment_id IS NULL AND dedupe_key IS NULL)
    OR (type IN ('discovery_follow','discovery_like','discovery_comment','discovery_reply')
      AND actor_id IS NOT NULL AND actor_id<>user_id AND dedupe_key IS NOT NULL
      AND ((type='discovery_follow' AND community_post_id IS NULL AND community_comment_id IS NULL)
        OR (type='discovery_like' AND community_post_id IS NOT NULL AND community_comment_id IS NULL)
        OR (type IN ('discovery_comment','discovery_reply') AND community_post_id IS NOT NULL AND community_comment_id IS NOT NULL)))
  );

CREATE TABLE discovery_notification_schema_state (
  singleton_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  migration_version INT UNSIGNED NOT NULL,
  application_revision INT UNSIGNED NOT NULL,
  completed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT ck_discovery_notification_state CHECK (singleton_id=1 AND migration_version=9 AND application_revision=1)
) ENGINE=InnoDB;

START TRANSACTION;
INSERT INTO discovery_notification_schema_state(singleton_id,migration_version,application_revision) VALUES(1,9,1);
COMMIT;
