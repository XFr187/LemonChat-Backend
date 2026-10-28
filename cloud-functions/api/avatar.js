import { getPool, initDb } from "../lib/db.js";
import { json, queryParams } from "../lib/http.js";

// GET /api/avatar?userId=1  取用户头像（base64 dataURL，可为空）
export default async function onRequest(context) {
  const { request } = context;
  try {
    await initDb();
    const userId = Number(queryParams(request).userId);
    if (!userId) return json({ ok: false, error: "缺userId" }, 400);
    const r = await getPool().query("SELECT avatar FROM users WHERE id=$1", [userId]);
    return json({ ok: true, avatar: r.rows[0]?.avatar || "" });
  } catch (e) {
    return json({ ok: false, error: "服务器开小差了" }, 500);
  }
}
