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
        `SELECT m.id, m.sender_id, m.content, m.created_at, u.avatar, u.nickname, u.is_official
         FROM messages m JOIN users u ON u.id = m.sender_id
         WHERE ((m.sender_id=$1 AND m.receiver_id=$2) OR (m.sender_id=$2 AND m.receiver_id=$1)) AND m.id > $3
         ORDER BY m.id ASC LIMIT 200`,
        [userId, peerId, after]
      );
      return json({
        ok: true,
        messages: r.rows.map((x) => ({
          id: x.id, sender_id: x.sender_id, content: x.content,
          created_at: x.created_at, avatar: x.avatar || "", nickname: x.nickname, is_official: x.is_official,
        })),
      });
    }
    if (request.method === "POST") {
      const { senderId, receiverId, content } = await readBody(request);
      if (!senderId || !receiverId || !content)
        return json({ ok: false, error: "参数不齐" }, 400);
      const isImage = typeof content === "string" && content.startsWith("data:image/");
      const maxLen = isImage ? 600000 : 2000;
      if (typeof content !== "string" || content.length > maxLen)
        return json({ ok: false, error: isImage ? "图片过大" : "消息过长" }, 400);
      // 发送者不能是被封禁状态
      const ban = await db.query("SELECT banned_until FROM users WHERE id=$1", [Number(senderId)]);
      if (ban.rows[0]?.banned_until && new Date(ban.rows[0].banned_until) > new Date())
        return json({ ok: false, code: "BANNED", error: "账号已被封禁" }, 403);
      // 关系检查：官方号可私信任何人；普通人需为好友
      const rel = await db.query("SELECT is_official FROM users WHERE id=$1", [Number(receiverId)]);
      const recOfficial = rel.rows[0]?.is_official;
      if (!recOfficial) {
        const blk = await db.query("SELECT 1 FROM blocks WHERE user_id=$1 AND blocked_id=$2", [Number(receiverId), Number(senderId)]);
        if (blk.rows.length) return json({ ok: false, code: "BLOCKED", error: "消息已发出，但被对方拒收了" });
        const fr = await db.query(
          "SELECT 1 FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)",
          [Number(senderId), Number(receiverId)]
        );
        if (!fr.rows.length) return json({ ok: false, code: "NOT_FRIEND", error: "您还不是对方的好友" });
      }
      const r = await db.query(
        "INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1,$2,$3) RETURNING id, created_at",
        [senderId, receiverId, content]
      );
      await db.query("UPDATE users SET last_seen=now() WHERE id IN ($1,$2)", [senderId, receiverId]);
      // 实时推送：通知聊天枢纽把消息推给在线的双方
      try {
        if (context.env?.CHAT_HUB) {
          const stub = context.env.CHAT_HUB.get(context.env.CHAT_HUB.idFromName("global"));
          const time = new Date(r.rows[0].created_at).getTime();
          const notify = { from: senderId, to: receiverId, content, time };
          await stub.fetch(new Request("https://internal/notify", {
            method: "POST",
            body: JSON.stringify(notify),
          }));
        }
      } catch {}
      return json({ ok: true, id: r.rows[0].id, created_at: r.rows[0].created_at });
    }
    return json({ ok: false, error: "只支持GET/POST" }, 405);
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
