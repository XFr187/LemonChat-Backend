import crypto from "node:crypto";
import { getPool, initDb } from "../lib/db.js";
import { json, queryParams, readBody } from "../lib/http.js";

function hash(pw, salt) {
  return crypto.createHash("sha256").update(salt + ":" + pw).digest("hex");
}

// GET /api/forgot?username=x  拿密保问题
// POST /api/forgot {username, secA, newPassword}  答对密保重置密码
export default async function onRequest(context) {
  const { request } = context;
  try {
    await initDb();
    const db = getPool();
    if (request.method === "GET") {
      const u = await db.query("SELECT sec_q FROM users WHERE username=$1", [queryParams(request).username || ""]);
      if (!u.rows.length || !u.rows[0].sec_q)
        return json({ ok: false, error: "该用户没设置密保问题，找管理员重置吧" }, 400);
      return json({ ok: true, secQ: u.rows[0].sec_q });
    }
    if (request.method === "POST") {
      const { username, secA, newPassword } = await readBody(request);
      if (!username || !secA || !newPassword) return json({ ok: false, error: "填全啊" }, 400);
      if (newPassword.length < 6) return json({ ok: false, error: "新密码至少6位" }, 400);
      const r = await db.query("SELECT sec_a FROM users WHERE username=$1", [username]);
      if (!r.rows.length) return json({ ok: false, error: "用户不存在" }, 400);
      if ((r.rows[0].sec_a || "").trim().toLowerCase() !== secA.trim().toLowerCase())
        return json({ ok: false, error: "密保答案不对" }, 400);
      const salt = crypto.randomBytes(8).toString("hex");
      await db.query("UPDATE users SET pass_hash=$1 WHERE username=$2", [salt + ":" + hash(newPassword, salt), username]);
      return json({ ok: true });
    }
    return json({ ok: false, error: "只支持GET/POST" }, 405);
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
