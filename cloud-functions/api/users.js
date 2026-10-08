import { getPool, initDb } from "../lib/db.js";
import { json, queryParams } from "../lib/http.js";

// GET /api/users?q=xxx&me=1  搜索用户
export default async function onRequest(context) {
  const { request } = context;
  try {
    await initDb();
    const db = getPool();
    const q = (queryParams(request).q || "").trim();
    const me = Number(queryParams(request).me || 0);
    if (!q) return json({ ok: true, users: [] });
    const r = await db.query(
      "SELECT id, username, nickname, bio, is_official FROM users WHERE (username ILIKE $1 OR nickname ILIKE $1) AND id <> $2 LIMIT 10",
      ["%" + q + "%", me]
    );
    return json({ ok: true, users: r.rows });
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
