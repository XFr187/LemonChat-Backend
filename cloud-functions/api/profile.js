import { getPool, initDb } from "../lib/db.js";
import { json, queryParams } from "../lib/http.js";

// GET /api/profile?userId=1
// POST /api/profile {userId, avatar}  更新头像（base64 dataURL，≤200KB）
export default async function onRequest(context) {
  const { request } = context;
  try {
    await initDb();
    const db = getPool();
    if (request.method === "POST") {
      const { userId, avatar } = await readBody(request);
      if (!userId) return json({ ok: false, error: "缺userId" }, 400);
      const a = typeof avatar === "string" ? avatar : "";
      if (a && (a.length > 280000 || !a.startsWith("data:image/")))
        return json({ ok: false, error: "头像不合法" }, 400);
      await db.query("UPDATE users SET avatar=$1 WHERE id=$2", [a, Number(userId)]);
      return json({ ok: true });
    }
    const userId = Number(queryParams(request).userId);
    if (!userId) return json({ ok: false, error: "缺userId" }, 400);
    const r = await db.query("SELECT id, username, nickname, bio, is_official, avatar FROM users WHERE id=$1", [userId]);
    if (!r.rows.length) return json({ ok: false, error: "用户不存在" }, 404);
    return json({ ok: true, user: r.rows[0] });
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
