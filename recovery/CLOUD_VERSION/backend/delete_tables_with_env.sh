#!/bin/bash
# 使用环境变量删除未使用的表
# 需要设置 TURSO_DATABASE_URL 和 TURSO_AUTH_TOKEN

# 从 TURSO_DATABASE_URL 提取数据库名称
if [ -z "$TURSO_DATABASE_URL" ]; then
    echo "❌ 请设置 TURSO_DATABASE_URL 环境变量"
    exit 1
fi

# 提取数据库名称（从 libsql://database-name.region.turso.io 格式）
DB_NAME=$(echo "$TURSO_DATABASE_URL" | sed 's|libsql://||' | sed 's|\..*||')

if [ -z "$DB_NAME" ]; then
    echo "❌ 无法从 TURSO_DATABASE_URL 提取数据库名称"
    exit 1
fi

echo "📊 数据库名称: $DB_NAME"
echo ""

# 检查是否已登录
if ! turso db list &>/dev/null; then
    echo "⚠️  需要先登录 Turso CLI"
    echo "   运行: turso auth login"
    echo ""
    echo "或者，如果你有 TURSO_AUTH_TOKEN，我可以帮你使用 libsql 客户端直接删除"
    exit 1
fi

echo "🗑️  开始删除未使用的表..."
echo ""

# 删除表
turso db shell $DB_NAME <<EOF
DROP TABLE IF EXISTS ai_data;
DROP TABLE IF EXISTS ai_enhanced_data;
DROP TABLE IF EXISTS ai_field_values;
DROP TABLE IF EXISTS ai_processed_data;
DROP TABLE IF EXISTS ai_prompts;
DROP TABLE IF EXISTS analysis_configs;
DROP TABLE IF EXISTS note_details;
DROP TABLE IF EXISTS raw_entries;
DROP TABLE IF EXISTS records;
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 删除完成！"
    echo ""
    echo "验证剩余的表:"
    turso db shell $DB_NAME "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
else
    echo ""
    echo "❌ 删除失败"
fi

