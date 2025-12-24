# 部署文档：Vercel（前端）+ Fly.io（后端 + SQLite 持久化卷）

> 如果你决定改用 Render（更少风控/更少 CLI 操作），请直接看：`DEPLOYMENT_VERCEL_RENDER.md`。

目标：在**不改代码/不改整体架构**的前提下，把项目上线到云端可长期运行；后端继续用 SQLite 作为主库（但放在 Fly 持久化卷上），同时保持 Turso 同步作为备份/副本。

> 仓库结构（以 GitHub 仓库根目录为起点）：
> - 前端：`recovery/CLOUD_VERSION/frontend`
> - 后端：`recovery/CLOUD_VERSION/backend`

---

## 0. 总体架构（阶段 1）

- 前端：Vercel 静态部署（Vite build 产物），通过环境变量指向后端 API。
- 后端：Fly.io 单实例常驻 Node（Express），SQLite 数据文件落在 Fly Volume（持久化）。
- 同步：后端进程内定时把本地 SQLite 的数据 **upsert** 到 Turso（默认 30s 一次，启动延迟 10s）。

后续扩展（阶段 2）：用户量上来需要多实例/高可用时，再把“写入主库”切到 Turso（那时才需要做代码/架构调整）。

---

## 1. 上线前必读（域名与登录 Cookie）

你的认证是**Cookie（SameSite=Lax）**方案。

- 如果前端是 `*.vercel.app`、后端是 `*.fly.dev`（不同站点），浏览器通常不会在跨站 `fetch` 中携带 Cookie，登录态会失效。
- **推荐做法（不改代码）**：为项目绑定自定义域名，并使用同一主域的子域名：
  - 前端：`https://app.example.com`
  - 后端：`https://api.example.com`

这样属于“同站点”（same-site），`SameSite=Lax` Cookie 能正常工作。

---

## 2. 环境变量清单

### 2.1 前端（Vercel）

- `VITE_API_URL`：后端公网地址（建议 `https://api.example.com`，不要带尾部 `/`）

### 2.2 后端（Fly）

**最小必需（可跑起来）**
- `NODE_ENV=production`
- `PORT=8080`（Fly 默认服务端口用 8080 更省心）
- `DB_PATH=/data/data.db`（把 SQLite 文件放在持久化卷挂载目录）
- `CORS_ORIGINS=https://app.example.com`（可逗号分隔多个 origin；必须精确匹配）

**建议尽快补齐（生产必需，尤其是登录相关）**
- `AUTH_COOKIE_SECRET`：长度 >= 16 的随机字符串（生产必须）
- `APP_BASE_URL`：前端基址（例如 `https://app.example.com`）
- `AUTH_BASE_URL`：后端基址（例如 `https://api.example.com`；OAuth 回调/邮件链接会用到）

**按需开启（功能相关）**
- Coze 解析/工作流：`COZE_ACCESS_TOKEN`、`COZE_APP_ID`、`COZE_WORKFLOW_ID`
- 邮件（Resend）：`RESEND_API_KEY`、`RESEND_FROM`
- OAuth：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`
- AI Provider（如 OpenAI/豆包/Claude/Ollama 等）：按你的实际使用填写

**Turso 作为备份/副本（同步）**
- `USE_TURSO=true`
- `TURSO_DATABASE_URL=...`
- `TURSO_AUTH_TOKEN=...`
- 可选：`TURSO_SYNC_INTERVAL_MS=30000`、`TURSO_INITIAL_SYNC_DELAY_MS=10000`
- 可选快速禁用同步：`DISABLE_TURSO_SYNC=true`

---

## 3. 后端部署到 Fly.io（单实例 + 持久化卷）

### 3.1 准备

1) 安装并登录 Fly CLI

```bash
flyctl version
flyctl auth login
```

2) 重要命名规则

- Fly 的 `app name` 只能用小写字母/数字/短横线（建议用：`echonotes-api` 而不是 `EchoNotes-api`）。
- `region` 是 Fly 的机房区域（例如新加坡 `sin`、香港 `hkg`、东京 `nrt`）；选离你用户近的即可。

2) 进入后端目录（在仓库根目录执行）

```bash
cd recovery/CLOUD_VERSION/backend
```

### 3.2 初始化 Fly 应用（生成 fly.toml）

```bash
flyctl launch --name <你的-app-名字> --region <region> --no-deploy
```

- `region` 建议选离你用户近的，例如 `hkg` / `sin` / `nrt` 等。
- 如果遇到 `better-sqlite3` 构建失败（原生依赖编译问题），见文末“常见问题”。

### 3.3 创建并挂载持久化卷（Volume）

在与应用相同 region 创建卷：

```bash
flyctl volumes create data --region <region> --size 1
```

- `--size 1` 表示 1GB，当前 `data.db` 只有几 MB，足够用很久。

### 3.4 配置 fly.toml（端口 + 挂载 + 环境变量）

编辑 `recovery/CLOUD_VERSION/backend/fly.toml`，确保包含这些关键点（示例仅供参考，按 launch 生成的结构合并）：

```toml
app = "<你的-app-名字>"

[env]
  NODE_ENV = "production"
  PORT = "8080"
  DB_PATH = "/data/data.db"
  CORS_ORIGINS = "https://app.example.com"
  USE_TURSO = "true"

[[mounts]]
  source = "data"
  destination = "/data"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
```

说明：
- `min_machines_running=1` 表示尽量保持常驻（更适合“随时可用”的个人/小规模阶段）。
- SQLite 主库阶段建议**永远只跑 1 台机器**：不要水平扩容实例数量。

### 3.5 设置机密（Fly Secrets）

把 `.env.local` 里的值（不要提交到 git）作为 Secrets 配置到 Fly：

```bash
flyctl secrets set \
  AUTH_COOKIE_SECRET="<随机>=16+" \
  APP_BASE_URL="https://app.example.com" \
  AUTH_BASE_URL="https://api.example.com" \
  COZE_ACCESS_TOKEN="..." \
  COZE_APP_ID="..." \
  COZE_WORKFLOW_ID="..." \
  TURSO_DATABASE_URL="..." \
  TURSO_AUTH_TOKEN="..."
```

### 3.6 部署与验证

```bash
flyctl deploy
flyctl status
flyctl logs
```

可选：确保单实例

```bash
flyctl scale count 1
```

---

## 4. 前端部署到 Vercel

### 4.1 创建项目

- Vercel → New Project → Import GitHub 仓库 `Gwen-Z/recovery`
- Project Settings → **Root Directory**：`recovery/CLOUD_VERSION/frontend`

### 4.2 环境变量

Vercel → Project Settings → Environment Variables：
- `VITE_API_URL = https://api.example.com`

### 4.3 SPA 路由重写（避免刷新 404）

如果你使用 React Router 的路径路由（不是 hash 路由），需要重写到 `index.html`。

方式 A（推荐）：在 `frontend/` 目录放一个 `vercel.json`：

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

方式 B：在 Vercel Dashboard 配置 Rewrites（效果相同）。

### 4.4 绑定域名（强烈推荐）

- 给前端绑定 `app.example.com`
- 给后端绑定 `api.example.com`

然后把：
- 后端 `CORS_ORIGINS` 改成 `https://app.example.com`
- 前端 `VITE_API_URL` 改成 `https://api.example.com`

---

## 5. 上线检查清单（Go-Live Checklist）

- [ ] `GET https://api.example.com/api/health`（如果没有 health 接口，就用任意 GET API 验证服务存活）
- [ ] 前端能正常请求后端：打开页面 → Network 中 `api/*` 不报 CORS
- [ ] 登录/注册可用（如启用 auth）：Cookie 能写入且后续请求带上（同主域子域名）
- [ ] `DB_PATH=/data/data.db` 生效：重启 Fly 机器后数据仍在
- [ ] Turso 同步（可选）：`fly logs` 能看到 `[turso-sync]` 的成功日志

---

## 6. 常见问题

### 6.1 Fly 构建失败（better-sqlite3 原生编译）

`better-sqlite3` 是原生依赖，某些构建环境可能缺编译工具导致失败。

处理方式（最省心）：给后端加 Dockerfile（让构建环境可控），然后再 `flyctl deploy`。

如果你遇到这个问题，把报错日志贴给我，我会基于你的错误信息给出对应的最小 Dockerfile 与 fly.toml 调整方案。

### 6.2 CORS 报错

你的后端 CORS 是“精确 origin 白名单”，所以必须把 `CORS_ORIGINS` 配成前端真实域名（包含 `https://`）。

### 6.3 Vercel Preview 链接不能用登录/接口

Preview 域名会变化，很难加入 CORS 白名单且 Cookie 也可能跨站。
建议：只把正式域名当作生产入口；Preview 主要用于页面检查。
