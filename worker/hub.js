// 聊天枢纽：所有在线用户连这里，有新消息立刻推
import { getPool, initDb } from "../cloud-functions/lib/db.js";

export class ChatHub {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // HTTP 发消息后的实时推送：{from, to, content, time}
    if (url.pathname === "/notify") {
      try {
        const { from, to, content, time } = await request.json();
        const payload = JSON.stringify({ type: "new_message", from, to, content, time });
        for (const id of [from, to]) {
          for (const sock of this.state.getWebSockets(`user:${id}`)) {
            try { sock.send(payload); } catch {}
          }
        }
      } catch {}
      return new Response("ok");
    }

    const userId = parseInt(url.searchParams.get("userId") || "0");
    if (!userId) return new Response("缺userId", { status: 400 });
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("需要WebSocket连接", { status: 426 });

    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1], [`user:${userId}`]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // 客户端发来 {type:"msg", from, to, content} → 存库 + 推给双方
  async webSocketMessage(ws, raw) {
    try {
      const data = JSON.parse(raw);
      if (data.type !== "msg") return;
      const { from, to, content } = data;
      if (!from || !to || !content) return;

      await initDb();
      const r = await getPool().query(
        "INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1,$2,$3) RETURNING id, created_at",
        [from, to, String(content).slice(0, 2000)]
      );
      const payload = JSON.stringify({
        type: "new_message",
        from, to,
        content,
        time: new Date(r.rows[0].created_at).getTime(),
      });
      for (const id of [from, to]) {
        for (const sock of this.state.getWebSockets(`user:${id}`)) {
          try { sock.send(payload); } catch {}
        }
      }
    } catch {}
  }

  async webSocketClose(ws) { try { ws.close(); } catch {} }
}
