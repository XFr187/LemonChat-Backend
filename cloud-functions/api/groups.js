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
      const { userId, name, groupId } = await readBody(request);
      if (!userId) return json({ ok: false, error: "缺userId" }, 400);

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
    return json({ ok: false, error: "ERR3: " + (e?.message || String(e)) }, 500);
  }
}
