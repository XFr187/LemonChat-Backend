import crypto from "node:crypto";
import { getPool, initDb } from "../lib/db.js";
import { json, readBody } from "../lib/http.js";

export default async function onRequest(context) {
  const { request } = context;
  if (request.method !== "POST") return json({ ok: false, error: "只支持POST" }, 405);
  const { username, password } = await readBody(request);
  if (!username || !password) return json({ ok: false, error: "填写用户名和密码" }, 400);
  try {
    await initDb();
    const db = getPool();
    const r = await db.query("SELECT id, nickname, pass_hash, is_official, banned_until FROM users WHERE username=$1", [username]);
    if (!r.rows.length) return json({ ok: false, error: "用户不存在" }, 400);
    const u = r.rows[0];
    if (u.banned_until && new Date(u.banned_until) > new Date()) {
      const days = Math.max(1, Math.ceil((new Date(u.banned_until) - new Date()) / 86400000));
      return json({ ok: false, banned: true, days, error: `您的账号已被封禁 ${days} 天` });
    }
    const [salt, ...rest] = u.pass_hash.split(":");
    const h = crypto.createHash("sha256").update(salt + ":" + password).digest("hex");
    if (h !== rest.join(":")) return json({ ok: false, error: "密码不对" }, 400);
    await db.query("UPDATE users SET last_seen=now() WHERE id=$1", [u.id]);
    return json({ ok: true, user: { id: u.id, nickname: u.nickname, is_official: u.is_official } });
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
