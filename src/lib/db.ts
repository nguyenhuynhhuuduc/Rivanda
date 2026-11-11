import mysql from "mysql2/promise";

// Giữ một pool duy nhất, kể cả khi Next.js tải lại module ở chế độ dev.
const globalForDb = globalThis as unknown as { pool?: mysql.Pool };

export const pool =
  globalForDb.pool ??
  mysql.createPool({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "personal_site",
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;
