import { getPool, initDb } from "../lib/db.js";
import { json, queryParams, readBody } from "../lib/http.js";

// GET /api/friends?userId=1  好友列表
// POST /api/friends {userId, friendId}  加好友（双向）
export default async function onRequest(context) {
  const { request } = context;
  try {
    await initDb();
    const db = getPool();
    if (request.method === "GET") {
      const userId = Number(queryParams(request).userId);
      if (!userId) return json({ ok: false, error: "缺userId" }, 400);
      const r = await db.query(
        `SELECT u.id, u.username, u.nickname, u.bio, u.is_official FROM friendships f
         JOIN users u ON u.id = (CASE WHEN f.user_id=$1 THEN f.friend_id ELSE f.user_id END)
         WHERE f.user_id=$1 OR f.friend_id=$1 ORDER BY u.id`,
        [userId]
      );
      return json({ ok: true, friends: r.rows });
    }
    if (request.method === "POST") {
      const { userId, friendId } = await readBody(request);
      if (!userId || !friendId || userId === friendId)
        return json({ ok: false, error: "参数不对" }, 400);
      const u = await db.query("SELECT id FROM users WHERE id IN ($1,$2)", [userId, friendId]);
      if (u.rows.length < 2) return json({ ok: false, error: "用户不存在" }, 400);
      await db.query(
        `INSERT INTO friendships (user_id, friend_id)
         SELECT LEAST($1,$2), GREATEST($1,$2)
         WHERE NOT EXISTS (
           SELECT 1 FROM friendships
           WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)
         )`,
        [userId, friendId]
      );
      return json({ ok: true });
    }
    return json({ ok: false, error: "只支持GET/POST" }, 405);
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
