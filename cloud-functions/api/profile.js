import { getPool, initDb } from "../lib/db.js";
import { json, queryParams } from "../lib/http.js";

// GET /api/profile?userId=1
export default async function onRequest(context) {
  const { request } = context;
  try {
    await initDb();
    const db = getPool();
    const userId = Number(queryParams(request).userId);
    if (!userId) return json({ ok: false, error: "缺userId" }, 400);
    const r = await db.query("SELECT id, username, nickname, bio, is_official FROM users WHERE id=$1", [userId]);
    if (!r.rows.length) return json({ ok: false, error: "用户不存在" }, 404);
    return json({ ok: true, user: r.rows[0] });
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
