# 快速修复指南 - API 超时问题

## 问题症状
页面显示："加载超时，请刷新页面重试"

## 立即执行的步骤

### 步骤 1：检查后端服务器是否运行

打开终端，检查后端是否在运行：

```bash
# 检查端口 3001 是否被占用
lsof -i :3001

# 或者
netstat -an | grep 3001
```

如果没有运行，启动后端：

```bash
cd CLOUD_VERSION/backend
npm start
```

### 步骤 2：禁用 Turso 同步（最重要）

在 `CLOUD_VERSION/backend/.env.local` 或项目根目录的 `.env.local` 中添加：

```bash
DISABLE_TURSO_SYNC=true
USE_TURSO=false
```

然后**重启后端服务器**。

### 步骤 3：检查后端日志

查看后端控制台输出，应该看到：

```
✅ 数据库初始化完成（本地优先）
⚠️ 使用本地 SQLite 数据库: /path/to/data.db
ℹ️ Turso 同步已禁用（DISABLE_TURSO_SYNC=true），运行纯本地模式
[backend] listening on http://localhost:3001
```

如果看到错误，请检查：
- 数据库文件是否存在
- 数据库文件权限是否正确

### 步骤 4：测试健康检查端点

在浏览器中访问：

```
http://localhost:3001/api/health
```

应该立即返回：

```json
{
  "success": true,
  "status": "ok",
  "timestamp": "...",
  "dbConnected": true
}
```

如果这个端点也超时，说明后端服务器有问题。

### 步骤 5：测试笔记本 API

在浏览器中访问：

```
http://localhost:3001/api/notebooks
```

应该在 2 秒内返回（即使数据库慢，也会返回空列表）。

## 如果仍然超时

### 方案 A：完全禁用数据库初始化检查

临时修改 `backend/src/server.js`，在 `/api/notebooks` 端点中：

```javascript
app.get('/api/notebooks', async (_req, res) => {
  // 临时：立即返回空列表，不查询数据库
  return res.json({
    success: true,
    data: []
  });
});
```

这样可以先让页面显示，然后再排查数据库问题。

### 方案 B：检查数据库文件

```bash
cd CLOUD_VERSION/backend
ls -la data.db

# 如果文件不存在或损坏，删除它让系统重新创建
rm data.db
# 然后重启后端
```

### 方案 C：检查端口冲突

如果 3001 端口被占用，修改端口：

在 `backend/.env.local` 中：

```bash
PORT=3002
```

然后修改前端代理配置（如果需要）。

## 验证修复

修复后，页面应该：
1. ✅ 立即显示（不再等待加载）
2. ✅ 即使 API 失败，也能显示空列表
3. ✅ 不再显示"加载超时"错误

## 常见问题

### Q: 后端启动很慢怎么办？
A: 检查是否有 Turso 连接尝试，禁用 `USE_TURSO=false`

### Q: 数据库查询很慢怎么办？
A: 已经优化为 2 秒超时，超时后返回空列表

### Q: 前端还是显示超时？
A: 检查浏览器控制台，查看具体的网络错误

## 联系支持

如果以上步骤都无法解决，请提供：
1. 后端控制台的完整日志
2. 浏览器控制台的错误信息
3. 网络请求的详细信息（F12 -> Network）

