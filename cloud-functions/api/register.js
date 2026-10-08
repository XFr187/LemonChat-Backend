import crypto from "node:crypto";
import { getPool, initDb } from "../lib/db.js";
import { json, readBody } from "../lib/http.js";

export default async function onRequest(context) {
  const { request } = context;
  if (request.method !== "POST") return json({ ok: false, error: "只支持POST" }, 405);
  const { username, password, nickname, secQ, secA } = await readBody(request);
  if (!username || !password || !nickname)
    return json({ ok: false, error: "用户名/密码/昵称不能为空" }, 400);
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return json({ ok: false, error: "用户名需3-20位字母数字下划线" }, 400);
  if (password.length < 6)
    return json({ ok: false, error: "密码至少6位" }, 400);
  try {
    await initDb();
    const db = getPool();
    const exists = await db.query("SELECT id FROM users WHERE username=$1", [username]);
    if (exists.rows.length) return json({ ok: false, error: "用户名已被占用" }, 400);
    const salt = crypto.randomBytes(8).toString("hex");
    const ip = (request.headers.get("x-forwarded-for") || context.clientIp || "").split(",")[0].trim() || "未知";
    const ua = request.headers.get("user-agent") || "未知设备";
    const r = await db.query(
      "INSERT INTO users (username, nickname, pass_hash, sec_q, sec_a, reg_ip, reg_ua) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, nickname",
      [username, nickname, salt + ":" + crypto.createHash("sha256").update(salt + ":" + password).digest("hex"), secQ || "", secA || "", ip, ua]
    );
    return json({ ok: true, user: { id: r.rows[0].id, nickname: r.rows[0].nickname } });
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
