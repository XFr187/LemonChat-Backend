import { getPool, initDb } from "../lib/db.js";
import { json, queryParams, readBody } from "../lib/http.js";

// GET  /api/friends?userId=1                  好友列表
// POST /api/friends {action:"delete"|"block"|"unblock"|"listBlocked", ...}
export default async function onRequest(context) {
  const { request } = context;
  try {
    await initDb();
    const db = getPool();

    if (request.method === "GET") {
      const userId = Number(queryParams(request).userId);
      if (!userId) return json({ ok: false, error: "缺userId" }, 400);
      const r = await db.query(
        `SELECT u.id, u.username, u.nickname, u.bio, u.is_official, u.avatar FROM friendships f
         JOIN users u ON u.id = (CASE WHEN f.user_id=$1 THEN f.friend_id ELSE f.user_id END)
         WHERE f.user_id=$1 OR f.friend_id=$1 ORDER BY u.id`,
        [userId]
      );
      return json({ ok: true, friends: r.rows });
    }

    if (request.method === "POST") {
      const { action, userId, friendId, targetId } = await readBody(request);
      if (!userId) return json({ ok: false, error: "缺userId" }, 400);

      if (action === "delete") {
        if (!friendId) return json({ ok: false, error: "缺friendId" }, 400);
        await db.query(
          "DELETE FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)",
          [Number(userId), Number(friendId)]
        );
        return json({ ok: true });
      }

      if (action === "block") {
        if (!targetId) return json({ ok: false, error: "缺targetId" }, 400);
        await db.query(
          "INSERT INTO blocks (user_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
          [Number(userId), Number(targetId)]
        );
        return json({ ok: true });
      }

      if (action === "unblock") {
        if (!targetId) return json({ ok: false, error: "缺targetId" }, 400);
        await db.query("DELETE FROM blocks WHERE user_id=$1 AND blocked_id=$2", [Number(userId), Number(targetId)]);
        return json({ ok: true });
      }

      if (action === "listBlocked") {
        const r = await db.query(
          `SELECT u.id, u.username, u.nickname, u.is_official FROM blocks b
           JOIN users u ON u.id = b.blocked_id WHERE b.user_id=$1 ORDER BY u.id`,
          [Number(userId)]
        );
        return json({ ok: true, blocked: r.rows });
      }
    }
    return json({ ok: false, error: "不支持的操作" }, 400);
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
