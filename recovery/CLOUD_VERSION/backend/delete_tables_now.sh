#!/bin/bash
# 删除未使用的表（需要先登录 Turso CLI）
# 使用方法: ./delete_tables_now.sh <database_name>

DB_NAME=$1

if [ -z "$DB_NAME" ]; then
    echo "❌ 请提供数据库名称"
    echo ""
    echo "使用方法: ./delete_tables_now.sh <database_name>"
    echo ""
    echo "首先，请登录 Turso CLI:"
    echo "  turso auth login"
    echo ""
    echo "然后查看可用的数据库:"
    echo "  turso db list"
    echo ""
    exit 1
fi

echo "🗑️  开始删除未使用的表..."
echo "数据库: $DB_NAME"
echo ""

# 删除表
echo "执行删除操作..."
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
    echo "验证剩余的表（应该只剩下5个使用中的表）:"
    turso db shell $DB_NAME "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
else
    echo ""
    echo "❌ 删除失败，请检查："
    echo "  1. 是否已登录 Turso CLI (turso auth login)"
    echo "  2. 数据库名称是否正确"
    echo "  3. 是否有删除权限"
fi

