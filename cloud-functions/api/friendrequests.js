import { getPool, initDb } from "../lib/db.js";
import { json, queryParams, readBody } from "../lib/http.js";

// 好友申请（微信式）
// POST /api/friendrequests {fromId, username, message}   按用户名发申请
// POST /api/friendrequests/accept {userId, requestId}    通过
// POST /api/friendrequests/reject {userId, requestId}    拒绝
// GET  /api/friendrequests?userId=1                      我收到的待处理申请
export default async function onRequest(context) {
  const { request } = context;
  try {
    await initDb();
    const db = getPool();
    const url = new URL(request.url);

    if (request.method === "POST") {
      const body = await readBody(request);
      const { fromId, userId, requestId } = body;

      if (url.pathname.endsWith("/accept") || url.pathname.endsWith("/reject")) {
        const action = url.pathname.endsWith("/accept") ? "accepted" : "rejected";
        if (!userId || !requestId) return json({ ok: false, error: "参数不齐" }, 400);
        const q = await db.query(
          "SELECT from_id, to_id, status FROM friend_requests WHERE id=$1",
          [Number(requestId)]
        );
        if (!q.rows.length) return json({ ok: false, error: "申请不存在" }, 404);
        if (q.rows[0].to_id !== Number(userId)) return json({ ok: false, error: "无权限" }, 403);
        if (q.rows[0].status !== "pending") return json({ ok: false, error: "该申请已处理" }, 400);
        await db.query("UPDATE friend_requests SET status=$1 WHERE id=$2", [action, Number(requestId)]);
        if (action === "accepted") {
          await db.query(
            `INSERT INTO friendships (user_id, friend_id)
             SELECT LEAST($1,$2), GREATEST($1,$2)
             WHERE NOT EXISTS (
               SELECT 1 FROM friendships
               WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)
             )`,
            [q.rows[0].from_id, q.rows[0].to_id]
          );
        }
        return json({ ok: true });
      }

      // 发申请
      const { username, message } = body;
      if (!fromId || !username) return json({ ok: false, error: "参数不齐" }, 400);
      const t = await db.query("SELECT id FROM users WHERE username=$1", [String(username).trim()]);
      if (!t.rows.length) return json({ ok: false, error: "用户不存在" }, 404);
      const toId = t.rows[0].id;
      if (toId === Number(fromId)) return json({ ok: false, error: "不能添加自己" }, 400);
      const blk = await db.query("SELECT 1 FROM blocks WHERE user_id=$1 AND blocked_id=$2", [toId, Number(fromId)]);
      if (blk.rows.length) return json({ ok: false, code: "BLOCKED", error: "您已被对方拉黑" }, 403);
      const fr = await db.query(
        "SELECT 1 FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)",
        [Number(fromId), toId]
      );
      if (fr.rows.length) return json({ ok: false, error: "你们已经是好友了" }, 400);
      const dup = await db.query(
        "SELECT 1 FROM friend_requests WHERE from_id=$1 AND to_id=$2 AND status='pending'",
        [Number(fromId), toId]
      );
      if (dup.rows.length) return json({ ok: false, error: "已发送过申请，等待对方处理" }, 400);
      await db.query(
        "INSERT INTO friend_requests (from_id, to_id, message) VALUES ($1,$2,$3)",
        [Number(fromId), toId, String(message || "").slice(0, 100)]
      );
      return json({ ok: true });
    }

    if (request.method === "GET") {
      const userId = Number(queryParams(request).userId);
      if (!userId) return json({ ok: false, error: "缺userId" }, 400);
      const r = await db.query(
        `SELECT fr.id, fr.from_id, fr.message, fr.created_at, u.username, u.nickname, u.is_official
         FROM friend_requests fr JOIN users u ON u.id = fr.from_id
         WHERE fr.to_id=$1 AND fr.status='pending' ORDER BY fr.id DESC`,
        [userId]
      );
      return json({ ok: true, requests: r.rows });
    }

    return json({ ok: false, error: "只支持GET/POST" }, 405);
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
