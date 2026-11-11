import type { RowDataPacket } from "mysql2";
import { pool } from "./db";

const WINDOW_MINUTES = 15;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;

export async function isBlocked(email: string, ip: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT SUM(email = ?) AS by_email, SUM(ip = ?) AS by_ip
       FROM login_attempts
      WHERE created_at > (NOW() - INTERVAL ${WINDOW_MINUTES} MINUTE)`,
    [email, ip]
  );
  const r = rows[0];
  return Number(r?.by_email ?? 0) >= MAX_PER_EMAIL || Number(r?.by_ip ?? 0) >= MAX_PER_IP;
}

export async function recordFailure(email: string, ip: string): Promise<void> {
  await pool.execute("INSERT INTO login_attempts (email, ip) VALUES (?, ?)", [email, ip]);
  await pool.execute("DELETE FROM login_attempts WHERE created_at < (NOW() - INTERVAL 1 DAY)");
}

export async function clearAttempts(email: string): Promise<void> {
  await pool.execute("DELETE FROM login_attempts WHERE email = ?", [email]);
}
