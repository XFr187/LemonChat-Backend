import { getPool, initDb } from "../lib/db.js";
import { json, readBody } from "../lib/http.js";

// POST /api/delete {userId} 注销账号
export default async function onRequest(context) {
  const { request } = context;
  if (request.method !== "POST") return json({ ok: false, error: "只支持POST" }, 405);
  const { userId } = await readBody(request);
  if (!userId) return json({ ok: false, error: "缺userId" }, 400);
  try {
    await initDb();
    const db = getPool();
    await db.query("DELETE FROM messages WHERE sender_id=$1 OR receiver_id=$1", [userId]);
    await db.query("DELETE FROM friendships WHERE user_id=$1 OR friend_id=$1", [userId]);
    await db.query("DELETE FROM users WHERE id=$1", [userId]);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: "注销失败，请稍后再试" }, 500);
  }
}
