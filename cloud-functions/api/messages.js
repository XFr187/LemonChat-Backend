import { getPool, initDb } from "../lib/db.js";
import { json, queryParams, readBody } from "../lib/http.js";

// GET /api/messages?userId=1&peerId=2&after=0  拉消息
// POST /api/messages {senderId, receiverId, content}  发消息
export default async function onRequest(context) {
  const { request } = context;
  try {
    await initDb();
    const db = getPool();
    if (request.method === "GET") {
      const q = queryParams(request);
      const userId = Number(q.userId);
      const peerId = Number(q.peerId);
      const after = Number(q.after || 0);
      if (!userId || !peerId) return json({ ok: false, error: "缺参数" }, 400);
      const r = await db.query(
        `SELECT id, sender_id, content, created_at FROM messages
         WHERE ((sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)) AND id > $3
         ORDER BY id ASC LIMIT 200`,
        [userId, peerId, after]
      );
      return json({ ok: true, messages: r.rows });
    }
    if (request.method === "POST") {
      const { senderId, receiverId, content } = await readBody(request);
      if (!senderId || !receiverId || !content)
        return json({ ok: false, error: "参数不齐" }, 400);
      if (typeof content !== "string" || content.length > 2000)
        return json({ ok: false, error: "消息过长" }, 400);
      const r = await db.query(
        "INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1,$2,$3) RETURNING id, created_at",
        [senderId, receiverId, content]
      );
      await db.query("UPDATE users SET last_seen=now() WHERE id IN ($1,$2)", [senderId, receiverId]);
      return json({ ok: true, id: r.rows[0].id, created_at: r.rows[0].created_at });
    }
    return json({ ok: false, error: "只支持GET/POST" }, 405);
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
