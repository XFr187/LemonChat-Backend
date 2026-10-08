// Lemon Chat 后端通用入口（Node 容器版，Zeabur / 任意 Docker 平台可用）
// 原理：把 HTTP 请求包装成 Web Request，转发给 cloud-functions/api/ 下对应模块
import http from "node:http";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const PORT = process.env.PORT || 8080;
const API_DIR = path.join(process.cwd(), "cloud-functions", "api");
const MIME = {
  ".html": "text/html; charset=UTF-8",
  ".js": "text/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function readRawBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(Buffer.alloc(0)));
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    // /api/<名称> -> cloud-functions/api/<名称>.js
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5).split("/")[0];
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        res.writeHead(404).end('{"ok":false,"error":"404"}');
        return;
      }
      const modPath = path.join(API_DIR, `${name}.js`);
      if (!fs.existsSync(modPath)) {
        res.writeHead(404, { "Content-Type": "application/json; charset=UTF-8" })
          .end('{"ok":false,"error":"接口不存在"}');
        return;
      }
      const mod = await import(pathToFileURL(modPath).href);
      const body = await readRawBody(req);
      const request = new Request(url.href, {
        method: req.method,
        headers: { "content-type": req.headers["content-type"] || "application/json" },
        body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
      });
      const resp = await mod.default({ request });
      const text = await resp.text();
      res.writeHead(resp.status, { "Content-Type": "application/json; charset=UTF-8" });
      res.end(text);
      return;
    }

    // 其余路径 -> 静态文件（根路径返回 index.html）
    let filePath = path.join(process.cwd(), decodeURIComponent(url.pathname));
    if (url.pathname === "/" || !fs.existsSync(filePath)) filePath = path.join(process.cwd(), "index.html");
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    console.error(e);
    res.writeHead(500, { "Content-Type": "application/json; charset=UTF-8" });
    res.end('{"ok":false,"error":"服务器开小差了"}');
  }
});

server.listen(PORT, () => console.log(`Lemon Chat 后端已启动，端口 ${PORT}`));
