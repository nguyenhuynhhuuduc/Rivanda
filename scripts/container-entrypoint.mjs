import { chown, realpath, stat } from 'node:fs/promises';
import { validateEnvironment } from './runtime-config.mjs';

// Railway mount root-owned volume. Chỉ đổi owner thư mục mount cố định,
// không recursive, không xóa/đổi owner file người dùng. Web server chạy UID 1000.
try {
  const problems = validateEnvironment(process.env);
  if (problems.length) throw Error('Cấu hình chưa đầy đủ; chạy check:staging để xem tên biến thiếu.');
  if (process.env.UPLOAD_DIR !== '/app/uploads' || await realpath(process.env.UPLOAD_DIR) !== '/app/uploads' || !(await stat('/app/uploads')).isDirectory()) throw Error('Volume phải mount đúng /app/uploads.');
  if (process.getuid() === 0) {
    await chown('/app/uploads', 1000, 1000);
    process.setgid(1000);
    process.setuid(1000);
  }
  if (process.getuid() !== 1000) throw Error('Web process phải chạy UID 1000.');
  process.umask(0o027);
  await import('./start.mjs');
} catch {
  console.error('Không khởi động: kiểm tra env, volume /app/uploads và quyền UID 1000.');
  process.exitCode = 1;
}
