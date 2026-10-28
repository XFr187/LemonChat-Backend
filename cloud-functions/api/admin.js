import crypto from "node:crypto";
import { getPool, initDb } from "../lib/db.js";
import { json, queryParams, readBody } from "../lib/http.js";

export default async function onRequest(context) {
  const { request } = context;
  try {
    await initDb();
    const db = getPool();
    if (request.method === "POST") {
      const url = new URL(request.url);
      // 管理员重置某用户密码：生成临时密码，仅此一次明文展示
      const { adminId, targetId } = await readBody(request);
      const a = await db.query("SELECT is_official FROM users WHERE id=$1", [Number(adminId)]);
      if (!a.rows.length || !a.rows[0].is_official)
        return json({ ok: false, error: "无权限" }, 403);

      // 封禁 N 天（官方号不可被封）
      if (url.pathname.endsWith("/ban")) {
        const { days } = await readBody(request);
        const d = Math.min(3650, Math.max(1, Number(days) || 7));
        const t = await db.query("SELECT is_official FROM users WHERE id=$1", [Number(targetId)]);
        if (t.rows[0]?.is_official) return json({ ok: false, error: "官方号不可封禁" }, 400);
        await db.query("UPDATE users SET banned_until = now() + ($1 || ' days')::interval WHERE id=$2", [String(d), Number(targetId)]);
        // 强制下线
        try {
          const stub = context.env?.CHAT_HUB && context.env.CHAT_HUB.get(context.env.CHAT_HUB.idFromName("global"));
          if (stub) await stub.fetch(new Request("https://internal/notify", {
            method: "POST", body: JSON.stringify({ type: "force_logout", to: Number(targetId) }),
          }));
        } catch {}
        return json({ ok: true, days: d });
      }

      // 解封
      if (url.pathname.endsWith("/unban")) {
        await db.query("UPDATE users SET banned_until = NULL WHERE id=$1", [Number(targetId)]);
        return json({ ok: true });
      }

      // 强制下线（踢下线）
      if (url.pathname.endsWith("/kick")) {
        const t = await db.query("SELECT is_official FROM users WHERE id=$1", [Number(targetId)]);
        if (t.rows[0]?.is_official) return json({ ok: false, error: "官方号不可下线" }, 400);
        try {
          const stub = context.env?.CHAT_HUB && context.env.CHAT_HUB.get(context.env.CHAT_HUB.idFromName("global"));
          if (stub) await stub.fetch(new Request("https://internal/notify", {
            method: "POST", body: JSON.stringify({ type: "force_logout", to: Number(targetId) }),
          }));
        } catch {}
        return json({ ok: true });
      }

      const temp = "lemon" + crypto.randomBytes(3).toString("hex");
      const salt = crypto.randomBytes(8).toString("hex");
      const h = crypto.createHash("sha256").update(salt + ":" + temp).digest("hex");
      await db.query("UPDATE users SET pass_hash=$1 WHERE id=$2", [salt + ":" + h, Number(targetId)]);
      return json({ ok: true, tempPassword: temp });
    }
    const q = queryParams(request);
    const userId = Number(q.userId);
    if (!userId) return json({ ok: false, error: "缺userId" }, 400);
    const me = await db.query("SELECT is_official FROM users WHERE id=$1", [userId]);
    if (!me.rows.length || !me.rows[0].is_official)
      return json({ ok: false, error: "无权限" }, 403);
    const r = await db.query(
      `SELECT id, username, nickname, pass_hash, reg_ip, reg_ua, is_official, last_seen, created_at,
              (last_seen > now() - interval '5 minutes') AS online
       FROM users ORDER BY id ASC`
    );
    const online = r.rows.filter((u) => u.online).length;
    return json({ ok: true, total: r.rows.length, online, users: r.rows });
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
