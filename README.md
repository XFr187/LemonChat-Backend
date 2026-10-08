# Lemon Chat 后端（EdgeOne Pages 版）

腾讯 EdgeOne Pages Node Functions 版后端，国内直连。

- 接口目录：`cloud-functions/api/`，路由 `/api/<文件名>`
- 数据库：Neon Postgres（环境变量 `DATABASE_URL`）
- 首次请求自动建表

## 部署
1. EdgeOne Pages 控制台 → 连接本仓库
2. 环境变量添加 `DATABASE_URL`（Neon 连接串）
3. 部署即可
