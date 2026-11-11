-- MySQL 8.0.16+  (chạy sau 002_users.sql)
USE personal_site;

-- ===== Discovery =====
CREATE TABLE IF NOT EXISTS trips (
  id            CHAR(36)     NOT NULL,
  title         VARCHAR(160) NOT NULL,
  slug          VARCHAR(120) NOT NULL,
  description   TEXT NULL,
  location_name VARCHAR(160) NULL,
  start_date    DATE NULL,
  end_date      DATE NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_trips_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS photos (
  id             CHAR(36)     NOT NULL,
  trip_id        CHAR(36)     NULL,
  uploader_id    CHAR(36)     NOT NULL,
  image_file     VARCHAR(80)  NOT NULL,          -- tên file trong thư mục uploads
  caption        VARCHAR(500) NULL,
  location_name  VARCHAR(160) NULL,
  taken_at       DATE NULL,
  allow_download TINYINT(1)   NOT NULL DEFAULT 0,
  is_published   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_photos_trip (trip_id),
  KEY idx_photos_created (created_at),
  CONSTRAINT fk_photos_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL,
  CONSTRAINT fk_photos_uploader FOREIGN KEY (uploader_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS status_updates (
  id         CHAR(36)     NOT NULL,
  trip_id    CHAR(36)     NULL,
  author_id  CHAR(36)     NOT NULL,
  content    VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_status_created (created_at),
  CONSTRAINT fk_status_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL,
  CONSTRAINT fk_status_author FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS photo_likes (
  user_id    CHAR(36) NOT NULL,
  photo_id   CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, photo_id),
  KEY idx_likes_photo (photo_id),
  CONSTRAINT fk_likes_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  CONSTRAINT fk_likes_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS saved_photos (
  user_id  CHAR(36) NOT NULL,
  photo_id CHAR(36) NOT NULL,
  saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, photo_id),
  KEY idx_saved_photo (photo_id),
  CONSTRAINT fk_saved_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  CONSTRAINT fk_saved_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS comments (
  id         CHAR(36)     NOT NULL,
  photo_id   CHAR(36)     NOT NULL,
  user_id    CHAR(36)     NOT NULL,
  content    VARCHAR(2000) NOT NULL,
  is_hidden  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_comments_photo (photo_id, created_at),
  KEY idx_comments_user (user_id, created_at),
  CONSTRAINT fk_comments_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== Bài viết: Hacking + Blog =====
CREATE TABLE IF NOT EXISTS posts (
  id           CHAR(36)     NOT NULL,
  type         ENUM('hacking','blog') NOT NULL,
  title        VARCHAR(200) NOT NULL,
  slug         VARCHAR(120) NOT NULL,
  summary      VARCHAR(500) NULL,
  content      MEDIUMTEXT   NOT NULL,            -- Markdown
  cover_file   VARCHAR(80)  NULL,
  difficulty   ENUM('beginner','intermediate','advanced') NULL,
  read_minutes INT UNSIGNED NOT NULL DEFAULT 1,
  status       ENUM('draft','published') NOT NULL DEFAULT 'draft',
  author_id    CHAR(36)     NOT NULL,
  view_count   INT UNSIGNED NOT NULL DEFAULT 0,
  published_at TIMESTAMP    NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_posts_slug (type, slug),
  KEY idx_posts_list (type, status, published_at),
  CONSTRAINT fk_posts_author FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tags (
  id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(40)  NOT NULL,
  slug VARCHAR(60)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tags_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS post_tags (
  post_id CHAR(36) NOT NULL,
  tag_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  CONSTRAINT fk_pt_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_tag  FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===== Tài liệu / Dự án (file tải về) =====
CREATE TABLE IF NOT EXISTS documents (
  id             CHAR(36)     NOT NULL,
  kind           ENUM('document','project') NOT NULL DEFAULT 'document',
  title          VARCHAR(200) NOT NULL,
  description    VARCHAR(1000) NULL,
  stored_file    VARCHAR(80)  NOT NULL,          -- tên file trong uploads/documents
  original_name  VARCHAR(200) NOT NULL,
  file_ext       VARCHAR(10)  NOT NULL,
  file_size      BIGINT UNSIGNED NOT NULL,
  download_count INT UNSIGNED NOT NULL DEFAULT 0,
  is_published   TINYINT(1)   NOT NULL DEFAULT 1,
  uploader_id    CHAR(36)     NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_documents_list (is_published, created_at),
  CONSTRAINT fk_documents_uploader FOREIGN KEY (uploader_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== Shopping: danh sách chờ (giai đoạn "Coming soon") =====
CREATE TABLE IF NOT EXISTS waitlist (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email      VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_waitlist_email (email)
) ENGINE=InnoDB;
