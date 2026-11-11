import mysql from 'mysql2/promise';

// Minimum shape cho code hiện tại; không thay thế kiểm tra types/FK/index hoặc migration lịch sử.
export const REQUIRED = {
  cyber_ip_allocator: 'id next_slot',
  cyber_virtual_ips: 'user_id ip_number assigned_at',
  home_settings: 'id site_name badge_text hero_title hero_subtitle cta_label cta_href hero_image instagram_url x_url facebook_url updated_at about_text contact_email',
  home_sections: 'section_key is_enabled sort_order',
  users: 'id email password_hash first_name last_name avatar_url bio role is_active created_at last_login_at',
  user_identities: 'provider provider_user_id user_id created_at',
  login_attempts: 'id email ip created_at',
  trips: 'id title slug description location_name start_date end_date created_at is_featured cover_photo_id',
  photos: 'id trip_id uploader_id image_file title caption location_name taken_at allow_download created_at thumb_file medium_file width height status review_note',
  status_updates: 'id trip_id author_id content created_at',
  photo_likes: 'user_id photo_id created_at', saved_photos: 'user_id photo_id saved_at',
  comments: 'id photo_id user_id content is_hidden created_at',
  posts: 'id type title slug summary content cover_file difficulty read_minutes status author_id view_count published_at created_at updated_at category section',
  tags: 'id name slug', post_tags: 'post_id tag_id',
  documents: 'id kind title description stored_file original_name file_ext file_size download_count is_published uploader_id created_at access can_download is_featured category',
  waitlist: 'id email created_at', albums: 'id title slug description trip_id cover_photo_id is_published created_at',
  album_photos: 'album_id photo_id sort_order', photo_tags: 'photo_id tag_id',
  collections: 'id user_id name is_public created_at', collection_photos: 'collection_id photo_id added_at',
  follows: 'follower_id followed_id created_at', reports: 'id reporter_id target_type target_id reason status handled_by created_at',
  notifications: 'id user_id type message link is_read created_at', activity_logs: 'id user_id action target_type target_id detail ip created_at',
  password_reset_tokens: 'id user_id token_hash expires_at used_at created_at', bookmarks: 'user_id target_type target_id created_at',
};

export function missingColumns(rows) {
  const actual = new Set(rows.map(r => `${r.TABLE_NAME}.${r.COLUMN_NAME}`));
  return Object.entries(REQUIRED).flatMap(([table, columns]) => columns.split(' ').filter(column => !actual.has(`${table}.${column}`)).map(column => `${table}.${column}`));
}

export async function checkSchema(env) {
  const connection = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, connectTimeout: 10000 });
  try {
    const [rows] = await connection.execute('SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()');
    const missing = missingColumns(rows);
    if (missing.length) throw Object.assign(Error('Schema thiếu cột/bảng cần thiết. Không tự chạy migration.'), { code: 'SCHEMA_INCOMPLETE', missing });
  } finally { await connection.end(); }
}
