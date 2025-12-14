-- 删除剩余的未使用表（Turso SQL）
-- 在 Turso 控制台执行此脚本

-- 未使用的表列表（从图片中看到的）
DROP TABLE IF EXISTS ai_data;
DROP TABLE IF EXISTS ai_enhanced_data;
DROP TABLE IF EXISTS ai_field_values;
DROP TABLE IF EXISTS ai_processed_data;
DROP TABLE IF EXISTS ai_prompts;
DROP TABLE IF EXISTS analysis_configs;
DROP TABLE IF EXISTS note_details;
DROP TABLE IF EXISTS raw_entries;
DROP TABLE IF EXISTS records;

-- 验证：查看剩余的表（应该只剩下5个使用中的表）
-- SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;

