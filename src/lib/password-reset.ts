import { createHash, randomBytes, randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2";
import { pool } from "./db";
import { appUrl } from "./oauth";
import { sendMail } from "./mail";
import { findUserByEmail } from "./users";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Tạo liên kết đặt lại mật khẩu và gửi qua email. Luôn im lặng nếu email không tồn tại. */
export async function requestPasswordReset(email: string): Promise<void> {
  // Không tạo/log reset link khi email delivery chưa được cấu hình.
  if (!process.env.SMTP_HOST) return;
  const user = await findUserByEmail(email);
  if (!user || !user.isActive) return;

  // Tối đa 3 yêu cầu mỗi giờ cho một tài khoản
  const [recent] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM password_reset_tokens WHERE user_id = ? AND created_at > (NOW() - INTERVAL 1 HOUR)",
    [user.id]
  );
  if (Number(recent[0]?.n ?? 0) >= 3) return;

  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, (NOW() + INTERVAL 1 HOUR))",
    [randomUUID(), user.id, hash(token)]
  );
  const link = `${appUrl()}/reset-password?token=${token}`;
  await sendMail(
    user.email,
    "Đặt lại mật khẩu",
    `Xin chào,\n\nBạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu. Bấm vào liên kết dưới đây trong vòng 1 giờ:\n\n${link}\n\nNếu không phải bạn, hãy bỏ qua email này.`
  );
}

export async function findValidResetToken(token: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1",
    [hash(token)]
  );
  return (rows[0]?.user_id as string | undefined) ?? null;
}

export async function consumeResetToken(token: string, passwordHash: string): Promise<boolean> {
  const userId = await findValidResetToken(token);
  if (!userId) return false;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Luôn khóa user trước token, cùng thứ tự với luồng đổi mật khẩu.
    const [users] = await connection.execute<RowDataPacket[]>("SELECT id FROM users WHERE id = ? AND is_active = 1 FOR UPDATE", [userId]);
    const [tokens] = await connection.execute<RowDataPacket[]>(
      "SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND user_id = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE", [hash(token), userId]);
    if (!users[0] || !tokens[0]) { await connection.rollback(); return false; }
    await connection.execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);
    await connection.execute("UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL", [userId]);
    await connection.commit();
    return true;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
