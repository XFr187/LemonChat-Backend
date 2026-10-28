// Cloudflare Workers 入口：把 /api/xxx 转发给 cloud-functions/api/xxx.js 的 onRequest
import { json } from "../cloud-functions/lib/http.js";
import { setDbUrl } from "../cloud-functions/lib/db.js";
import { ChatHub } from "./hub.js";

export { ChatHub };
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
    try {
      // 把数据库地址交给 db 模块（不走 process.env）
      setDbUrl(env.DATABASE_URL);

      const url = new URL(request.url);
      if (url.pathname === "/" || url.pathname === "") {
        return new Response("Lemon Chat backend is running 🍋", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=UTF-8" },
        });
      }
      if (url.pathname === "/debug") {
        return json({ has: !!env.DATABASE_URL, len: (env.DATABASE_URL || "").length, keys: Object.keys(env) });
      }
      if (url.pathname === "/ws") {
        const stub = env.CHAT_HUB.get(env.CHAT_HUB.idFromName("global"));
        return stub.fetch(request);
      }
      const name = url.pathname.replace(/^\/api\//, "").replace(/\/+$/, "");
      const handler = routes[name];
      if (!handler) return json({ ok: false, error: "接口不存在" }, 404);
      return await handler({ request, env });
    } catch (e) {
      return json({ ok: false, error: "入口开小差了: " + (e?.message || e) }, 500);
    }
  },
};
