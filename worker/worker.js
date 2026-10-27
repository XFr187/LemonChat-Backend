// Cloudflare Workers 入口：把 /api/xxx 转发给 cloud-functions/api/xxx.js 的 onRequest
import { json } from "../cloud-functions/lib/http.js";
import login from "../cloud-functions/api/login.js";
import register from "../cloud-functions/api/register.js";
import forgot from "../cloud-functions/api/forgot.js";
import profile from "../cloud-functions/api/profile.js";
import users from "../cloud-functions/api/users.js";
import conversations from "../cloud-functions/api/conversations.js";
import messages from "../cloud-functions/api/messages.js";
import friends from "../cloud-functions/api/friends.js";
import admin from "../cloud-functions/api/admin.js";
import del from "../cloud-functions/api/delete.js";

const routes = {
  login,
  register,
  forgot,
  profile,
  users,
  conversations,
  messages,
  friends,
  admin,
  delete: del,
};

export default {
  async fetch(request, env, ctx) {
    // 让原有函数里的 process.env.DATABASE_URL 继续生效
    if (!globalThis.process) globalThis.process = { env: {} };
    globalThis.process.env.DATABASE_URL = env.DATABASE_URL;

    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "") {
      return new Response("Lemon Chat backend is running 🍋", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=UTF-8" },
      });
    }
    const name = url.pathname.replace(/^\/api\//, "").replace(/\/+$/, "");
    const handler = routes[name];
    if (!handler) return json({ ok: false, error: "接口不存在" }, 404);
    try {
      return await handler({ request });
    } catch (e) {
      return json({ ok: false, error: "服务器开小差了" }, 500);
    }
  },
};
