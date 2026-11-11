-- READ-ONLY TEMPLATE. Not executed by this change; not a migration runner.
-- Review against an explicitly named isolated test DB first. No secrets or user rows.
SELECT DATABASE() AS selected_schema, VERSION() AS mysql_version;
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('users','posts','tags','trips','photos');
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLLATION_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND (
  (TABLE_NAME IN ('users','posts','trips','photos') AND COLUMN_NAME = 'id') OR
  (TABLE_NAME = 'tags' AND COLUMN_NAME = 'id') OR
  (TABLE_NAME = 'posts' AND COLUMN_NAME IN ('type','status','author_id'))
);
-- Before each draft: its target tables MUST be absent, or STOP (possible partial DDL).
SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (
  'blog_foundation_state','blog_topics','blog_post_details','blog_review_events','content_rate_buckets',
  'community_topics','community_posts','community_media','community_post_tags',
  'community_likes','community_saves','community_comments','community_reports','community_review_events',
  'journey_places','journey_trip_places','journey_photo_places'
);
SELECT status, COUNT(*) AS blog_count FROM posts WHERE type = 'blog' GROUP BY status;
SELECT COUNT(*) AS orphan_blog_author FROM posts p LEFT JOIN users u ON u.id = p.author_id
WHERE p.type = 'blog' AND u.id IS NULL;
-- Also review SHOW CREATE TABLE for each referenced table and FK/index metadata,
-- migration history/version collisions, writer maintenance, backup + restore rehearsal.
-- Empty/expected SELECT output is NOT authorization to run any DDL.
