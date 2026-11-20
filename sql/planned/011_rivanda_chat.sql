-- Migration 011: Rivanda Realtime Direct Messaging
-- Additive only: tạo mới 4 bảng phục vụ nhắn tin 1-1, không sửa hay xóa dữ liệu người dùng hiện có.
-- Yêu cầu: MySQL 8.0+, đã có bảng `users(id CHAR(36))` và `follows(follower_id, followed_id)`.

CREATE TABLE IF NOT EXISTS conversations (
  id              CHAR(36)     NOT NULL,
  type            ENUM('direct') NOT NULL DEFAULT 'direct',
  direct_key      VARCHAR(80)  NOT NULL,
  last_message_id CHAR(36)     NULL,
  last_message_at TIMESTAMP(6) NULL,
  created_at      TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversations_direct_key (direct_key),
  KEY idx_conversations_last_msg (last_message_at DESC, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id      CHAR(36)     NOT NULL,
  user_id              CHAR(36)     NOT NULL,
  joined_at            TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  last_read_message_id CHAR(36)     NULL,
  last_read_at         TIMESTAMP(6) NULL,
  unread_count         INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id),
  KEY idx_conv_members_user (user_id, conversation_id),
  CONSTRAINT fk_conv_members_conv
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_members_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id              CHAR(36)     NOT NULL,
  conversation_id CHAR(36)     NOT NULL,
  sender_id       CHAR(36)     NOT NULL,
  client_msg_id   VARCHAR(64)  NULL,
  body            TEXT         NOT NULL,
  delivered_at    TIMESTAMP(6) NULL,
  read_at         TIMESTAMP(6) NULL,
  created_at      TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at      TIMESTAMP(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_messages_client_id (conversation_id, sender_id, client_msg_id),
  KEY idx_messages_conv_created (conversation_id, created_at DESC, id DESC),
  KEY idx_messages_sender (sender_id, created_at DESC),
  CONSTRAINT fk_messages_conv
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_attachments (
  id          CHAR(36)     NOT NULL,
  message_id  CHAR(36)     NOT NULL,
  stored_file VARCHAR(120) NOT NULL,
  mime_type   VARCHAR(60)  NOT NULL,
  file_size   INT UNSIGNED NOT NULL,
  width       INT UNSIGNED NULL,
  height      INT UNSIGNED NULL,
  created_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_msg_attach_msg (message_id),
  CONSTRAINT fk_msg_attach_msg
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
