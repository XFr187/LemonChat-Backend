import pg from "pg";

let pool = null;
let dbReady = false;
let dbUrl = process.env?.DATABASE_URL || "";

// Worker 入口会把 env.DATABASE_URL 传进来（不碰 process.env，避开 nodejs_compat 的坑）
export function setDbUrl(url) { if (url) dbUrl = url; }

// CF Workers 上 pg.Pool 的空闲连接会被平台掐掉，复用死连接会引发 1101 崩溃。
// 改为每次查询开新连接用完即关（流量小，开销可忽略）。
export function getPool() {
  if (!pool) {
    pool = {
      async query(sql, params) {
        const client = new pg.Client({
          connectionString: dbUrl,
          ssl: { rejectUnauthorized: false },
        });
        await client.connect();
        try {
          return await client.query(sql, params);
        } finally {
          client.end().catch(() => {});
        }
      },
    };
  }
  return pool;
}

export async function initDb() {
  if (dbReady) return;
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
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
    );
    CREATE TABLE IF NOT EXISTS friendships (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      friend_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (user_id, friend_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      receiver_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  // 老库补列
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_official BOOLEAN DEFAULT false`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reg_ip TEXT DEFAULT ''`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reg_ua TEXT DEFAULT ''`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT now()`);
  dbReady = true;
}
