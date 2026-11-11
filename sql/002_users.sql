-- MySQL 8.0.16+  (chạy sau 001_home_settings.sql)
USE personal_site;

CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)     NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NULL,            -- NULL nếu chỉ đăng nhập bằng Google/Facebook
  first_name    VARCHAR(60)  NOT NULL,
  last_name     VARCHAR(60)  NOT NULL DEFAULT '',
  avatar_url    VARCHAR(500) NULL,
  role          ENUM('member','admin') NOT NULL DEFAULT 'member',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Liên kết tài khoản với Google / Facebook
CREATE TABLE IF NOT EXISTS user_identities (
  provider         ENUM('google','facebook') NOT NULL,
  provider_user_id VARCHAR(100) NOT NULL,
  user_id          CHAR(36)     NOT NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, provider_user_id),
  KEY idx_identities_user (user_id),
  CONSTRAINT fk_identities_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Ghi lại các lần đăng nhập sai để tạm khóa khi thử quá nhiều
CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email      VARCHAR(255) NOT NULL,
  ip         VARCHAR(64)  NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attempts_email (email, created_at),
  KEY idx_attempts_ip (ip, created_at)
) ENGINE=InnoDB;
