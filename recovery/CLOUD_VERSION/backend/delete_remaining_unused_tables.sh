#!/bin/bash
# 使用 Turso CLI 删除剩余的未使用表
# 使用方法: ./delete_remaining_unused_tables.sh <database_name>

DB_NAME=$1

if [ -z "$DB_NAME" ]; then
    echo "❌ 请提供数据库名称"
    echo "使用方法: ./delete_remaining_unused_tables.sh <database_name>"
    echo ""
    echo "可用的数据库列表:"
    turso db list
    exit 1
fi

echo "🗑️  开始删除剩余的未使用表..."
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

echo ""
echo "✅ 删除完成！"
echo ""
echo "验证剩余的表（应该只剩下5个使用中的表）:"
turso db shell $DB_NAME "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

