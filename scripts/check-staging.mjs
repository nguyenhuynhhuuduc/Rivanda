import { validateEnvironment, validateStorage } from './runtime-config.mjs';
import { checkSchema } from './check-schema.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export async function preflight(env) {
  const problems = validateEnvironment(env);
  if (problems.length) throw Object.assign(Error('Cấu hình chưa hợp lệ.'), { problems });
  await validateStorage(env); // Chỉ stat/access/realpath, không tạo/xóa file.
  await checkSchema(env); // Chỉ INFORMATION_SCHEMA SELECT, không DML/DDL.
}

export function reportFailure(error) {
  console.error('Preflight thất bại:', error.code === 'SCHEMA_INCOMPLETE' ? 'SCHEMA_INCOMPLETE' : 'CONFIG_STORAGE_OR_DATABASE');
  for (const problem of error.problems ?? []) console.error(problem);
  if (error.missing) console.error('Thiếu:', error.missing.join(', '));
  // Không in error.message/stack từ driver: có thể chứa hostname, user hoặc secret.
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await preflight(process.env); console.log('Preflight đạt: cấu hình/storage và minimum schema read-only. FK/index/types còn cần đối chiếu riêng.'); }
  catch (error) { reportFailure(error); process.exitCode = 1; }
}
