import { getPool, initDb } from "../lib/db.js";
import { json, queryParams, readBody } from "../lib/http.js";

// GET  /api/groupmessages?groupId=1&after=0     群消息历史
// POST /api/groupmessages {groupId, senderId, content}  发群消息（并推送在线成员）
export default async function onRequest(context) {
  const { request } = context;
  try {
    await initDb();
    const db = getPool();

    if (request.method === "POST") {
      const { groupId, senderId, content } = await readBody(request);
      if (!groupId || !senderId || !content)
        return json({ ok: false, error: "参数不齐" }, 400);
      const isImage = typeof content === "string" && content.startsWith("data:image/");
      const maxLen = isImage ? 600000 : 2000;
      if (typeof content !== "string" || content.length > maxLen)
        return json({ ok: false, error: isImage ? "图片过大" : "消息过长" }, 400);
      // 必须是群成员才能发言
      const m = await db.query(
        "SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2",
        [Number(groupId), Number(senderId)]
      );
      if (!m.rows.length) return json({ ok: false, error: "你不在群里" }, 403);
      const r = await db.query(
        "INSERT INTO group_messages (group_id, sender_id, content) VALUES ($1,$2,$3) RETURNING id, created_at",
        [Number(groupId), Number(senderId), content]
      );
      // 拉成员名单，把消息推给所有在线成员（门铃）
      const members = await db.query(
        "SELECT user_id FROM group_members WHERE group_id=$1",
        [Number(groupId)]
      );
      const ids = members.rows.map((x) => x.user_id);
      try {
        if (context.env?.CHAT_HUB) {
          const stub = context.env.CHAT_HUB.get(context.env.CHAT_HUB.idFromName("global"));
          const time = new Date(r.rows[0].created_at).getTime();
          await stub.fetch(new Request("https://internal/notify", {
            method: "POST",
            body: JSON.stringify({
              type: "new_group_message",
              group: Number(groupId),
              from: Number(senderId),
              content,
              time,
              to: ids,
            }),
          }));
        }
      } catch {}
      return json({ ok: true, id: r.rows[0].id, created_at: r.rows[0].created_at });
    }

    if (request.method === "GET") {
      const q = queryParams(request);
      const groupId = Number(q.groupId);
      const after = Number(q.after || 0);
      if (!groupId) return json({ ok: false, error: "缺groupId" }, 400);
      const r = await db.query(
        `SELECT gm.id, gm.sender_id, gm.content, gm.created_at, u.nickname, u.avatar, u.is_official
         FROM group_messages gm JOIN users u ON u.id = gm.sender_id
         WHERE gm.group_id=$1 AND gm.id > $2 ORDER BY gm.id ASC LIMIT 300`,
        [groupId, after]
      );
      return json({
        ok: true,
        messages: r.rows.map((x) => ({
          id: x.id, senderId: x.sender_id, content: x.content,
          nickname: x.nickname, avatar: x.avatar || "", is_official: x.is_official,
          time: new Date(x.created_at).getTime(),
        })),
      });
    }

    return json({ ok: false, error: "只支持GET/POST" }, 405);
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
