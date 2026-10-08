# Lemon Chat 后端

Lemon Chat App 的服务端，Node.js 容器版，部署在 Zeabur。数据库用 Neon Postgres（免费）。

## 接口一览

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/register` | POST | 注册 |
| `/api/login` | POST | 登录 |
| `/api/forgot` | POST | 找回密码（密保问题） |
| `/api/users?q=&me=` | GET | 搜索用户 |
| `/api/profile?userId=` | GET | 获取资料 |
| `/api/friends` | GET/POST | 好友列表 / 加好友（双向） |
| `/api/messages` | GET/POST | 拉消息 / 发消息 |
| `/api/conversations?userId=` | GET | 会话列表 |
| `/api/admin` | POST | 官方号管理操作 |
| `/api/delete` | POST | 注销账号 |

首次请求自动建表（users / friendships / messages）。

## 部署到 Zeabur

1. 登录 [zeabur.com](https://zeabur.com)（GitHub 账号直接登录，免费方案不用绑卡）
2. 新建 Project → 添加服务 → **Git** → 选本仓库 `LemonChat-Backend`
3. 服务设置里添加环境变量：
   - `DATABASE_URL` = Neon 连接串
4. 部署完成后，在「网络 / Networking」里生成域名，得到 `https://xxx.zeabur.app`
5. App 端把后端地址换成这个域名即可

## 本地运行

```bash
npm install
DATABASE_URL="postgres://..." npm start   # 默认端口 8080
```

## 结构

- `server.js` —— 通用入口：把 HTTP 请求转发给 `cloud-functions/api/` 下对应模块
- `cloud-functions/api/` —— 每个文件一个接口，路由即文件名
- `cloud-functions/lib/` —— 数据库连接池 + 小工具
- `Dockerfile` —— Zeabur 直接识别并构建
