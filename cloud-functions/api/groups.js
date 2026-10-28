import { getPool, initDb } from "../lib/db.js";
import { json, queryParams, readBody } from "../lib/http.js";

// GET  /api/groups?userId=1                     我加入的群列表
// POST /api/groups  {userId, name}              建群（创建者自动入群）
// POST /api/groups/join  {userId, groupId}      按群号加群
export default async function onRequest(context) {
  const { request } = context;
  try {
    await initDb();
    const db = getPool();

    if (request.method === "POST") {
      const url = new URL(request.url);
      const { userId, name, groupId, action, username } = await readBody(request);
      if (!userId) return json({ ok: false, error: "缺userId" }, 400);

      // 邀请成员
      if (action === "invite") {
        if (!groupId || !username) return json({ ok: false, error: "参数不齐" }, 400);
        const im = await db.query("SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2", [Number(groupId), Number(userId)]);
        if (!im.rows.length) return json({ ok: false, error: "你不在群里" }, 403);
        const t = await db.query("SELECT id FROM users WHERE username=$1", [String(username).trim()]);
        if (!t.rows.length) return json({ ok: false, error: "用户不存在" }, 404);
        await db.query(
          "INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
          [Number(groupId), t.rows[0].id]
        );
        return json({ ok: true });
      }

      // 退群（群主不能退，只能解散）
      if (action === "leave") {
        if (!groupId) return json({ ok: false, error: "缺groupId" }, 400);
        const g = await db.query("SELECT owner_id FROM groups WHERE id=$1", [Number(groupId)]);
        if (!g.rows.length) return json({ ok: false, error: "群不存在" }, 404);
        if (g.rows[0].owner_id === Number(userId)) return json({ ok: false, error: "群主不能退出，请解散群聊" }, 400);
        await db.query("DELETE FROM group_members WHERE group_id=$1 AND user_id=$2", [Number(groupId), Number(userId)]);
        return json({ ok: true });
      }

      // 解散（仅群主）
      if (action === "dissolve") {
        if (!groupId) return json({ ok: false, error: "缺groupId" }, 400);
        const g = await db.query("SELECT owner_id FROM groups WHERE id=$1", [Number(groupId)]);
        if (!g.rows.length) return json({ ok: false, error: "群不存在" }, 404);
        if (g.rows[0].owner_id !== Number(userId)) return json({ ok: false, error: "只有群主能解散" }, 403);
        await db.query("DELETE FROM group_messages WHERE group_id=$1", [Number(groupId)]);
        await db.query("DELETE FROM group_members WHERE group_id=$1", [Number(groupId)]);
        await db.query("DELETE FROM groups WHERE id=$1", [Number(groupId)]);
        return json({ ok: true });
      }

      // 加群
      if (url.pathname.endsWith("/join")) {
        if (!groupId) return json({ ok: false, error: "缺groupId" }, 400);
        const g = await db.query("SELECT id FROM groups WHERE id=$1", [Number(groupId)]);
        if (!g.rows.length) return json({ ok: false, error: "群不存在" }, 404);
        await db.query(
          "INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
          [Number(groupId), Number(userId)]
        );
        return json({ ok: true });
      }

      // 建群
      if (!name || typeof name !== "string" || !name.trim())
        return json({ ok: false, error: "群名不能为空" }, 400);
      const r = await db.query(
        "INSERT INTO groups (name, owner_id) VALUES ($1,$2) RETURNING id, name",
        [name.trim().slice(0, 30), Number(userId)]
      );
      await db.query(
        "INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [r.rows[0].id, Number(userId)]
      );
      return json({ ok: true, group: r.rows[0] });
    }

    if (request.method === "GET") {
      const userId = Number(queryParams(request).userId);
      if (!userId) return json({ ok: false, error: "缺userId" }, 400);
      const r = await db.query(
        `SELECT g.id, g.name, u.nickname AS owner, g.owner_id,
                (SELECT count(*) FROM group_members m2 WHERE m2.group_id = g.id) AS members
         FROM groups g
         JOIN group_members m ON m.group_id = g.id AND m.user_id = $1
         JOIN users u ON u.id = g.owner_id
         ORDER BY g.id ASC`,
        [userId]
      );
      return json({ ok: true, groups: r.rows });
    }

    return json({ ok: false, error: "只支持GET/POST" }, 405);
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
