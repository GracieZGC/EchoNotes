# 部署文档：Vercel（前端）+ Render（后端 + SQLite 持久化磁盘）

目标：在**不改代码/不改整体架构**的前提下，把项目上线到云端可长期运行；后端继续用 SQLite 作为主库（但放在 Render 持久化磁盘上），同时保持 Turso 同步作为备份/副本与迁移通道。

> 仓库结构（以 GitHub 仓库根目录为起点）：
> - 前端：`recovery/CLOUD_VERSION/frontend`
> - 后端：`recovery/CLOUD_VERSION/backend`

---

## 0. 总体架构（阶段 1）

- 前端：Vercel 静态部署（Vite build 产物），通过环境变量指向后端 API。
- 后端：Render Web Service 常驻 Node（Express），SQLite 数据文件落在 Render Persistent Disk（持久化）。
- 同步：后端进程内定时把本地 SQLite 的数据 **upsert** 到 Turso（默认 30s 一次，启动延迟 10s）。

后续扩展（阶段 2）：用户量上来需要多实例/高可用时，再把“写入主库”切到 Turso（那时才需要做代码/架构调整）。

---

## 1. 上线前必读（域名与登录 Cookie）

你的认证是 Cookie（SameSite=Lax）方案：如果前端是 `*.vercel.app`、后端是 `*.onrender.com`（不同站点），浏览器通常不会在跨站 `fetch` 中携带 Cookie，登录态会失效。

**推荐做法（不改代码）**：绑定自定义域名，并使用同一主域的子域名：
- 前端：`https://app.example.com`
- 后端：`https://api.example.com`

这样属于“同站点”（same-site），Cookie 更容易正常工作。

---

## 2. 环境变量清单

### 2.1 前端（Vercel）

- `VITE_API_URL`：后端公网地址（建议 `https://api.example.com`，不要带尾部 `/`）

### 2.2 后端（Render）

**最小必需（可跑起来）**
- `NODE_ENV=production`
- `DB_PATH=/var/data/data.db`（SQLite 放在 Persistent Disk 的挂载目录）
- `CORS_ORIGINS=https://app.example.com`（可逗号分隔多个 origin；必须精确匹配）

**建议尽快补齐（生产必需，尤其是登录相关）**
- `AUTH_COOKIE_SECRET`：长度 >= 16 的随机字符串（生产必须）
- `APP_BASE_URL`：前端基址（例如 `https://app.example.com`）
- `AUTH_BASE_URL`：后端基址（例如 `https://api.example.com`；OAuth 回调/邮件链接会用到）

**Turso 作为备份/副本（同步）**
- `USE_TURSO=true`
- `TURSO_DATABASE_URL=...`
- `TURSO_AUTH_TOKEN=...`
- 可选：`TURSO_SYNC_INTERVAL_MS=30000`、`TURSO_INITIAL_SYNC_DELAY_MS=10000`
- 可选快速禁用同步：`DISABLE_TURSO_SYNC=true`

**按需开启（功能相关）**
- Coze：`COZE_ACCESS_TOKEN`、`COZE_APP_ID`、`COZE_WORKFLOW_ID`
- 邮件（Resend）：`RESEND_API_KEY`、`RESEND_FROM`
- OAuth：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`
- AI Provider：按你的实际使用填写（`OPENAI_API_KEY`/`DOUBAO_API_KEY`/`ANTHROPIC_API_KEY` 等）

---

## 3. 后端部署到 Render（单实例 + Persistent Disk）

### 3.1 为什么建议用 Docker 部署

后端依赖 `better-sqlite3`（原生模块）。用 Docker 可以把构建环境固定住，减少 Render 的构建差异问题。

仓库里已准备：`recovery/CLOUD_VERSION/backend/Dockerfile`。

### 3.2 创建 Web Service

Render Dashboard → New → **Web Service** → 连接你的 GitHub 仓库 `Gwen-Z/recovery`。

关键配置：
- **Root Directory**：`recovery/CLOUD_VERSION/backend`
- **Environment**：选择 `Docker`
- **Instance Count**：1（SQLite 主库阶段不要多实例）
- **Plan**：为了“随时可用”，避免免费层休眠（Render 免费层可能会睡眠），建议选付费的基础档（按你看到的最低档即可）

### 3.3 添加 Persistent Disk（用于 SQLite）

在服务设置里添加 **Persistent Disk**：
- Mount Path：`/var/data`
- Size：1GB（当前 `data.db` 是 MB 级别，够用）

并在 Render 的 Environment Variables 里配置：
- `DB_PATH=/var/data/data.db`

### 3.4 配置环境变量（Render → Environment）

至少配置：
- `NODE_ENV=production`
- `CORS_ORIGINS=https://app.example.com`（或先填你的 Vercel production 域名）
- `AUTH_COOKIE_SECRET=<>=16 位随机>`

如果你要启用 Turso 备份/迁移：
- `USE_TURSO=true`
- `TURSO_DATABASE_URL=...`
- `TURSO_AUTH_TOKEN=...`

说明：
- Render 会自动注入 `PORT`，后端代码会读取 `process.env.PORT`，无需手动设置。

### 3.5 部署与验证

点击 Deploy 后，打开 Logs：
- 确认服务启动成功
- 确认数据库路径指向 `/var/data/data.db`
- 如果开启 Turso，同步日志会出现 `[turso-sync]`

---

## 4. 前端部署到 Vercel

Vercel → New Project → Import GitHub 仓库 `Gwen-Z/recovery`
- **Root Directory**：`recovery/CLOUD_VERSION/frontend`
- Environment Variables：
  - `VITE_API_URL=https://api.example.com`（或先填 Render 的临时域名）

SPA 路由重写（避免刷新 404）：
- 在 `frontend/` 放一个 `vercel.json`：

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

---

## 5. 数据迁移（推荐用 Turso 作为中转）

如果你本地 `backend/data.db` 里已经有数据，想无痛迁移到 Render：

1) 先在你电脑上跑后端，并开启 Turso 同步（让数据从本地 SQLite 推到 Turso）
   - 设置本地环境变量：`USE_TURSO=true` + `TURSO_DATABASE_URL/TURSO_AUTH_TOKEN`
   - 运行后端一段时间，直到日志里同步 `push 0`（表示基本追平）

2) Render 上首次启动时，如果本地数据库为空且 Turso 可连，会自动从 Turso 导入到本地 SQLite（见后端启动流程）。

这样你无需手动上传 `data.db` 文件到 Render 磁盘。

---

## 6. 上线检查清单

- [ ] 前端能访问，`/api/*` 不报 CORS
- [ ] 登录/注册可用（如启用 auth）：同主域子域名下 Cookie 能写入且后续请求携带
- [ ] 数据写入后，Render 重启服务数据仍在（Persistent Disk 生效）
- [ ] 若启用 Turso：Logs 里能看到 `[turso-sync]` 成功日志

