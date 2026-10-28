import { neon } from "@neondatabase/serverless";

let pool = null;
let dbReady = false;
let dbUrl = process.env?.DATABASE_URL || "";

// Worker 入口会把 env.DATABASE_URL 传进来（不碰 process.env，避开 nodejs_compat 的坑）
export function setDbUrl(url) { if (url) dbUrl = url; }

// Workers 出站 TCP 连不上 Neon，改走 Neon 官方 HTTP 驱动（纯 HTTPS 查询）。
// 对外仍然暴露 query(sql, params) → { rows }，上层函数不用改。
export function getPool() {
  if (!pool) {
    pool = {
      async query(sql, params) {
        const fn = neon(dbUrl);
        const result = await fn.query(sql, Array.isArray(params) ? params : []);
        // 单语句返回行数组；多语句返回按语句分组的嵌套数组（拍平成行）
        const rows = Array.isArray(result) && result.every((r) => Array.isArray(r))
          ? result.flat()
          : result;
        return { rows: rows ?? [], rowCount: rows?.length ?? 0 };
      },
    };
  }
  return pool;
}

export async function initDb() {
  if (dbReady) return;
  const db = getPool();
  // 快速探测：表和列都齐就跳过建表（冷启动从 8 条 SQL 降到 2 条，省一大截）
  try {
    await db.query(`SELECT id, bio, is_official, reg_ip, reg_ua, last_seen, avatar, banned_until FROM users LIMIT 1`);
    await db.query(`SELECT 1 FROM group_members LIMIT 1`);
    await db.query(`SELECT 1 FROM group_messages LIMIT 1`);
    await db.query(`SELECT 1 FROM friend_requests LIMIT 1`);
    await db.query(`SELECT 1 FROM blocks LIMIT 1`);
    dbReady = true;
    return;
  } catch (_) { /* 缺表缺列，走全量初始化 */ }
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      nickname TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      sec_q TEXT DEFAULT '',
      sec_a TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      is_official BOOLEAN DEFAULT false,
      reg_ip TEXT DEFAULT '',
      reg_ua TEXT DEFAULT '',
      last_seen TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      friend_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (user_id, friend_id)
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      receiver_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL REFERENCES groups(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      joined_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (group_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS group_messages (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES groups(id),
      sender_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS friend_requests (
      id SERIAL PRIMARY KEY,
      from_id INTEGER NOT NULL REFERENCES users(id),
      to_id INTEGER NOT NULL REFERENCES users(id),
      message TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS blocks (
      user_id INTEGER NOT NULL REFERENCES users(id),
      blocked_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (user_id, blocked_id)
    )`,
  ];
  for (const s of statements) await db.query(s);
  // 老库补列
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_official BOOLEAN DEFAULT false`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reg_ip TEXT DEFAULT ''`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reg_ua TEXT DEFAULT ''`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT now()`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT ''`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ`);
  dbReady = true;
}
