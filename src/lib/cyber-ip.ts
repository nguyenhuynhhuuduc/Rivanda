import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { pool } from "./db";
import { CYBER_IP_CAPACITY, ipNumberToString, slotToIpNumber } from "./cyber-ip-address";

/** Caller sở hữu transaction. Cùng thứ tự khóa: user -> allocator, không đổi IP đã cấp. */
export async function allocateVirtualIp(connection: PoolConnection, userId: string): Promise<string> {
  const [users] = await connection.execute<RowDataPacket[]>("SELECT id FROM users WHERE id = ? AND is_active = 1 FOR UPDATE", [userId]);
  if (!users[0]) throw new Error("CYBER_IP_USER_NOT_FOUND");
  const [existing] = await connection.execute<RowDataPacket[]>("SELECT ip_number FROM cyber_virtual_ips WHERE user_id = ?", [userId]);
  if (existing[0]) return ipNumberToString(Number(existing[0].ip_number));
  const [rows] = await connection.execute<RowDataPacket[]>("SELECT next_slot FROM cyber_ip_allocator WHERE id = 1 FOR UPDATE");
  const slot = Number(rows[0]?.next_slot);
  if (!Number.isInteger(slot) || slot < 0 || slot >= CYBER_IP_CAPACITY) throw new Error("CYBER_IP_POOL_EXHAUSTED");
  const address = slotToIpNumber(slot);
  await connection.execute("INSERT INTO cyber_virtual_ips (user_id, ip_number) VALUES (?, ?)", [userId, address]);
  await connection.execute("UPDATE cyber_ip_allocator SET next_slot = ? WHERE id = 1", [slot + 1]);
  return ipNumberToString(address);
}

export async function ensureVirtualIp(userId: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const ip = await allocateVirtualIp(connection, userId);
      await connection.commit();
      return ip;
    } catch (error) {
      await connection.rollback();
      if (attempt >= 2 || !["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes((error as { code?: string }).code ?? "")) throw error;
    } finally { connection.release(); }
  }
}
