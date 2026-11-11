-- MySQL 8.0.16+  (chạy MỘT LẦN, sau 003_content.sql)
USE personal_site;

-- ===== Vai trò, hồ sơ =====
ALTER TABLE users
  MODIFY role ENUM('member','contributor','moderator','admin') NOT NULL DEFAULT 'member',
  ADD COLUMN bio VARCHAR(500) NULL AFTER avatar_url;

-- ===== Trang chủ: thêm giới thiệu và email liên hệ =====
ALTER TABLE home_settings
  ADD COLUMN about_text   TEXT NULL,
  ADD COLUMN contact_email VARCHAR(255) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS home_sections (
  section_key VARCHAR(30) NOT NULL,
  is_enabled  TINYINT(1)  NOT NULL DEFAULT 1,
  sort_order  INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (section_key)
) ENGINE=InnoDB;

INSERT IGNORE INTO home_sections (section_key, is_enabled, sort_order) VALUES
  ('featured_journeys', 1, 10),
  ('latest_discovery',  1, 20),
  ('cyber_lab',         1, 30),
  ('latest_articles',   1, 40),
  ('featured_projects', 1, 50),
  ('about',             1, 60);

-- ===== Ảnh: trạng thái kiểm duyệt, bản thu nhỏ, tiêu đề =====
ALTER TABLE photos
  ADD COLUMN title       VARCHAR(160) NULL AFTER image_file,
  ADD COLUMN thumb_file  VARCHAR(90)  NULL,
  ADD COLUMN medium_file VARCHAR(90)  NULL,
  ADD COLUMN width       INT UNSIGNED NULL,
  ADD COLUMN height      INT UNSIGNED NULL,
  ADD COLUMN status ENUM('draft','pending','published','rejected','archived') NOT NULL DEFAULT 'published',
  ADD COLUMN review_note VARCHAR(500) NULL;
UPDATE photos SET status = IF(is_published = 1, 'published', 'draft') WHERE id IS NOT NULL; -- (WHERE để chạy được cả khi Workbench bật Safe Updates)
ALTER TABLE photos DROP COLUMN is_published, ADD KEY idx_photos_status (status, created_at);

-- ===== Hành trình (bảng trips): nổi bật và ảnh bìa =====
ALTER TABLE trips
  ADD COLUMN is_featured   TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN cover_photo_id CHAR(36) NULL,
  ADD CONSTRAINT fk_trips_cover FOREIGN KEY (cover_photo_id) REFERENCES photos(id) ON DELETE SET NULL;

-- ===== Album =====
CREATE TABLE IF NOT EXISTS albums (
  id             CHAR(36)     NOT NULL,
  title          VARCHAR(160) NOT NULL,
  slug           VARCHAR(120) NOT NULL,
  description    TEXT NULL,
  trip_id        CHAR(36)     NULL,
  cover_photo_id CHAR(36)     NULL,
  is_published   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_albums_slug (slug),
  CONSTRAINT fk_albums_trip  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL,
  CONSTRAINT fk_albums_cover FOREIGN KEY (cover_photo_id) REFERENCES photos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS album_photos (
  album_id   CHAR(36) NOT NULL,
  photo_id   CHAR(36) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (album_id, photo_id),
  KEY idx_ap_photo (photo_id),
  CONSTRAINT fk_ap_album FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
  CONSTRAINT fk_ap_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===== Thẻ cho ảnh (dùng chung bảng tags với bài viết) =====
CREATE TABLE IF NOT EXISTS photo_tags (
  photo_id CHAR(36) NOT NULL,
  tag_id   INT UNSIGNED NOT NULL,
  PRIMARY KEY (photo_id, tag_id),
  KEY idx_pht_tag (tag_id),
  CONSTRAINT fk_pht_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pht_tag   FOREIGN KEY (tag_id)   REFERENCES tags(id)   ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===== Cộng đồng =====
CREATE TABLE IF NOT EXISTS collections (
  id         CHAR(36)    NOT NULL,
  user_id    CHAR(36)    NOT NULL,
  name       VARCHAR(80) NOT NULL,
  is_public  TINYINT(1)  NOT NULL DEFAULT 0,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_collections_user (user_id),
  CONSTRAINT fk_collections_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS collection_photos (
  collection_id CHAR(36) NOT NULL,
  photo_id      CHAR(36) NOT NULL,
  added_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_id, photo_id),
  KEY idx_cp_photo (photo_id),
  CONSTRAINT fk_cp_collection FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_photo      FOREIGN KEY (photo_id)      REFERENCES photos(id)      ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS follows (
  follower_id CHAR(36) NOT NULL,
  followed_id CHAR(36) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, followed_id),
  KEY idx_follows_followed (followed_id),
  CONSTRAINT fk_follows_a FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_follows_b FOREIGN KEY (followed_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reports (
  id          CHAR(36)    NOT NULL,
  reporter_id CHAR(36)    NOT NULL,
  target_type ENUM('photo','comment') NOT NULL,
  target_id   CHAR(36)    NOT NULL,
  reason      VARCHAR(500) NOT NULL,
  status      ENUM('open','resolved','dismissed') NOT NULL DEFAULT 'open',
  handled_by  CHAR(36)    NULL,
  created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reports_status (status, created_at),
  CONSTRAINT fk_reports_user FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id         CHAR(36)     NOT NULL,
  user_id    CHAR(36)     NOT NULL,
  type       VARCHAR(30)  NOT NULL,
  message    VARCHAR(300) NOT NULL,
  link       VARCHAR(300) NULL,
  is_read    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, is_read, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     CHAR(36)     NULL,
  action      VARCHAR(60)  NOT NULL,
  target_type VARCHAR(30)  NULL,
  target_id   VARCHAR(40)  NULL,
  detail      VARCHAR(500) NULL,
  ip          VARCHAR(64)  NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         CHAR(36)  NOT NULL,
  user_id    CHAR(36)  NOT NULL,
  token_hash CHAR(64)  NOT NULL,
  expires_at DATETIME  NOT NULL,
  used_at    DATETIME  NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reset_hash (token_hash),
  KEY idx_reset_user (user_id, created_at),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===== Bài viết Cyber Lab: chuyên mục và loại =====
ALTER TABLE posts
  ADD COLUMN category VARCHAR(30) NULL,
  ADD COLUMN section ENUM('article','tutorial','tool','lab','research') NOT NULL DEFAULT 'article';

-- ===== Tài liệu: quyền truy cập, nổi bật, danh mục =====
ALTER TABLE documents
  MODIFY kind ENUM('document','project','resource') NOT NULL DEFAULT 'document',
  ADD COLUMN access ENUM('public','members','private') NOT NULL DEFAULT 'public',
  ADD COLUMN can_download TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN is_featured  TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN category VARCHAR(60) NULL;

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id     CHAR(36) NOT NULL,
  target_type ENUM('document','post') NOT NULL,
  target_id   CHAR(36) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, target_type, target_id),
  CONSTRAINT fk_bookmarks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
