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
    const r = await db.query("SELECT id, nickname, pass_hash, is_official FROM users WHERE username=$1", [username]);
    if (!r.rows.length) return json({ ok: false, error: "用户不存在" }, 400);
    const [salt, ...rest] = r.rows[0].pass_hash.split(":");
    const h = crypto.createHash("sha256").update(salt + ":" + password).digest("hex");
    if (h !== rest.join(":")) return json({ ok: false, error: "密码不对" }, 400);
    await db.query("UPDATE users SET last_seen=now() WHERE id=$1", [r.rows[0].id]);
    return json({ ok: true, user: { id: r.rows[0].id, nickname: r.rows[0].nickname, is_official: r.rows[0].is_official } });
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
