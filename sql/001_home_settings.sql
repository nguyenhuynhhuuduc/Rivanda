-- MySQL 8.0.16+
CREATE DATABASE IF NOT EXISTS personal_site
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE personal_site;

-- Nội dung trang Home do admin chỉnh. Chỉ có đúng 1 dòng (id = 1).
CREATE TABLE IF NOT EXISTS home_settings (
  id            TINYINT UNSIGNED NOT NULL DEFAULT 1,
  site_name     VARCHAR(60)  NOT NULL,
  badge_text    VARCHAR(120) NOT NULL,
  hero_title    VARCHAR(160) NOT NULL,
  hero_subtitle VARCHAR(400) NOT NULL,
  cta_label     VARCHAR(40)  NOT NULL,
  cta_href      VARCHAR(200) NOT NULL,
  hero_image    VARCHAR(80)  NULL,          -- tên file trong thư mục uploads
  instagram_url VARCHAR(255) NOT NULL DEFAULT '',
  x_url         VARCHAR(255) NOT NULL DEFAULT '',
  facebook_url  VARCHAR(255) NOT NULL DEFAULT '',
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_home_single_row CHECK (id = 1)
) ENGINE=InnoDB;

INSERT INTO home_settings
  (id, site_name, badge_text, hero_title, hero_subtitle, cta_label, cta_href)
VALUES
  (1, 'Tên của bạn',
   'Chào mừng bạn đến với website của tôi',
   'Khám phá cùng tôi',
   'Nơi tôi lưu lại những chuyến đi, những dòng chữ và những điều học được trên đường.',
   'Xem hành trình', '/discovery')
ON DUPLICATE KEY UPDATE id = id;
