-- 验证表的使用情况
-- 执行此查询查看当前数据库中的所有表

SELECT 
    name as table_name,
    CASE 
        WHEN name IN ('ai_analysis_setting', 'analysis_results', 'article_parse_history', 'notebooks', 'notes') 
        THEN '✅ 使用中'
        ELSE '❌ 未使用'
    END as status
FROM sqlite_master 
WHERE type='table' 
ORDER BY 
    CASE 
        WHEN name IN ('ai_analysis_setting', 'analysis_results', 'article_parse_history', 'notebooks', 'notes') 
        THEN 0 
        ELSE 1 
    END,
    name;

