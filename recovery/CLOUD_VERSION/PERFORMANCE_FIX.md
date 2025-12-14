# 性能问题快速解决方案

## 问题描述
架构改为"本地 SQLite 优先 + 后台同步 Turso"后，所有页面加载变慢甚至无法加载。

## 快速解决方案（按优先级）

### 方案 1：完全禁用 Turso 同步（最快，推荐）

在 `.env.local` 或环境变量中添加：

```bash
DISABLE_TURSO_SYNC=true
```

或者：

```bash
TURSO_SYNC_DISABLED=true
```

**效果**：立即禁用同步，所有查询使用本地 SQLite，性能恢复。

---

### 方案 2：禁用 Turso 连接（如果方案1不够）

在 `.env.local` 中移除或注释掉：

```bash
# USE_TURSO=false
# TURSO_DATABASE_URL=...
# TURSO_AUTH_TOKEN=...
```

或者直接设置：

```bash
USE_TURSO=false
```

**效果**：完全不连接 Turso，纯本地模式。

---

### 方案 3：增加同步间隔（如果必须保留同步）

在 `.env.local` 中设置：

```bash
TURSO_SYNC_INTERVAL_MS=300000  # 5分钟同步一次
TURSO_INITIAL_SYNC_DELAY_MS=60000  # 启动后60秒再同步
```

**效果**：减少同步频率，降低对性能的影响。

---

## 已修复的问题

1. ✅ **修复了 initDB 返回值**：现在正确返回 `{ primary, tursoClient }`
2. ✅ **确保本地 SQLite 优先**：即使启用 Turso，所有 API 查询都使用本地 SQLite
3. ✅ **添加快速禁用选项**：通过环境变量快速禁用同步

## 验证修复

重启后端服务器后，查看日志：

```
✅ 数据库初始化完成（本地优先）
ℹ️ Turso 同步已禁用（DISABLE_TURSO_SYNC=true），运行纯本地模式
```

或者：

```
✅ 数据库初始化完成（本地优先）
⚠️ 使用本地 SQLite 数据库: /path/to/data.db
ℹ️ 未开启 Turso 同步，运行纯本地模式
```

## 推荐配置（开发环境）

在 `.env.local` 中添加：

```bash
# 禁用 Turso 同步，使用纯本地模式
DISABLE_TURSO_SYNC=true
USE_TURSO=false
```

这样可以获得最佳性能，同时保留代码兼容性。

## 生产环境建议

如果需要在生产环境使用 Turso：

1. 使用方案 3，增加同步间隔
2. 确保 Turso 连接稳定
3. 监控同步性能，必要时调整间隔

