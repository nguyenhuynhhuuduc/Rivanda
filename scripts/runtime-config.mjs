import path from 'node:path';
import { access, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';

export function validateEnvironment(env) {
  const problems = [];
  if (!['staging', 'production'].includes(env.APP_ENV)) problems.push('APP_ENV phải là staging hoặc production.');
  for (const key of ['APP_URL', 'SESSION_SECRET', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'UPLOAD_DIR']) {
    if (!env[key]) problems.push(`Thiếu ${key}.`);
  }
  if ((env.SESSION_SECRET?.length ?? 0) < 32 || /thay-bang|change.me|example|placeholder/i.test(env.SESSION_SECRET ?? '')) problems.push('SESSION_SECRET cần secret riêng, từ 32 ký tự, không dùng mẫu.');
  try {
    const url = new URL(env.APP_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error();
  } catch { problems.push('APP_URL phải là HTTPS origin, không path/query/credentials.'); }
  const port = Number(env.DB_PORT);
  if (env.DB_USER?.toLowerCase() === 'root') problems.push('DB_USER phải là tài khoản ứng dụng riêng, không dùng root.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('DB_PORT không hợp lệ.');
  if (env.UPLOAD_DIR && !path.isAbsolute(env.UPLOAD_DIR)) problems.push('UPLOAD_DIR phải là đường dẫn tuyệt đối.');
  if (env.RAILWAY_PROJECT_ID && (!env.RAILWAY_VOLUME_MOUNT_PATH || path.resolve(env.RAILWAY_VOLUME_MOUNT_PATH) !== path.resolve(env.UPLOAD_DIR || '.'))) problems.push('Railway Volume mount phải trùng UPLOAD_DIR.');
  if (env.RAILWAY_PROJECT_ID && !env.DB_HOST?.endsWith('.railway.internal')) problems.push('Bản cấu hình Railway này yêu cầu MySQL private *.railway.internal; chưa hỗ trợ cấu hình TLS cho DB public.');
  if (env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() === 'staging' && env.APP_ENV !== 'staging') problems.push('Railway staging phải đặt APP_ENV=staging.');
  if (env.APP_ENV === 'staging') {
    if (!env.STAGING_AUTH_USERNAME || env.STAGING_AUTH_USERNAME.includes(':')) problems.push('STAGING_AUTH_USERNAME không hợp lệ.');
    if ((env.STAGING_AUTH_PASSWORD?.length ?? 0) < 20) problems.push('STAGING_AUTH_PASSWORD cần ít nhất 20 ký tự.');
  }
  for (const [id, secret] of [['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET']]) {
    if (!!env[id] !== !!env[secret]) problems.push(`Cần cấu hình cả ${id} và ${secret}, hoặc để trống cả hai.`);
  }
  return problems;
}

export async function validateStorage(env) {
  const info = await stat(env.UPLOAD_DIR);
  if (!info.isDirectory()) throw Error('UPLOAD_DIR không phải thư mục.');
  await access(env.UPLOAD_DIR, constants.R_OK | constants.W_OK);
  if (env.RAILWAY_VOLUME_MOUNT_PATH && await realpath(env.UPLOAD_DIR) !== await realpath(env.RAILWAY_VOLUME_MOUNT_PATH)) throw Error('Storage không trùng volume mount thực.');
}
