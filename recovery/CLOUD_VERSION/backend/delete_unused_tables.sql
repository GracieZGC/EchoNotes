-- 删除 Turso 数据库中未使用的表
-- 注意：此操作不可逆，请确保已备份数据
-- 使用方法：在 Turso 控制台的 SQL 编辑器中执行此脚本

-- 未使用的表列表
-- 1. ai_data
-- 2. ai_enhanced_data
-- 3. ai_field_values
-- 4. ai_processed_data
-- 5. ai_prompts
-- 6. analysis_configs
-- 7. note_details
-- 8. raw_entries
-- 9. records
-- 10. simple_records

-- 删除索引（如果存在）
DROP INDEX IF EXISTS idx_ai_data_created_at;
DROP INDEX IF EXISTS idx_ai_enhanced_data_created_at;
DROP INDEX IF EXISTS idx_ai_field_values_created_at;
DROP INDEX IF EXISTS idx_ai_processed_data_created_at;
DROP INDEX IF EXISTS idx_ai_prompts_created_at;
DROP INDEX IF EXISTS idx_analysis_configs_created_at;
DROP INDEX IF EXISTS idx_note_details_created_at;
DROP INDEX IF EXISTS idx_raw_entries_created_at;
DROP INDEX IF EXISTS idx_records_created_at;
DROP INDEX IF EXISTS idx_simple_records_created_at;

-- 删除表
DROP TABLE IF EXISTS ai_data;
DROP TABLE IF EXISTS ai_enhanced_data;
DROP TABLE IF EXISTS ai_field_values;
DROP TABLE IF EXISTS ai_processed_data;
DROP TABLE IF EXISTS ai_prompts;
DROP TABLE IF EXISTS analysis_configs;
DROP TABLE IF EXISTS note_details;
DROP TABLE IF EXISTS raw_entries;
DROP TABLE IF EXISTS records;
DROP TABLE IF EXISTS simple_records;

-- 验证：查看剩余的表
-- SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;

