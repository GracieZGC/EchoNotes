/**
 * 检查所有数据库表的使用情况
 * 包括图片中显示的所有表
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 从图片中看到的表（完整列表）
const ALL_TABLES = [
  'ai_analysis_setting',
  'ai_data',
  'ai_enhanced_data',  // 可能是 ai_enhanced_d...
  'ai_field_values',
  'ai_processed_data',  // 可能是 ai_processed_...
  'ai_prompts',
  'analysis_configs',
  'analysis_results',
  'article_parse_history',
  'note_details',
  'notebooks',
  'notes',
  'raw_entries',
  'records',
  'simple_records'
];

// 读取文件内容
function readFile(filePath) {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (error) {
    return '';
  }
}

// 检查表在代码中的使用情况
function checkTableUsage(tableName) {
  const backendPath = join(__dirname, 'src');
  const frontendPath = join(__dirname, '../frontend/src');
  
  const usage = {
    backend: false,
    frontend: false,
    sync: false,
    locations: []
  };

  // 检查后端文件
  const backendFiles = [
    'server.js',
    'routes/parse.js',
    'services/turso-sync.js',
    'lib/db.js',
    'services/ai-service.js'
  ];

  backendFiles.forEach(file => {
    const content = readFile(join(backendPath, file));
    if (content.includes(tableName)) {
      usage.backend = true;
      usage.locations.push(`backend/${file}`);
    }
  });

  // 检查前端文件
  const frontendFiles = [
    'apiClient.ts',
    'components/AINoteImportPage.tsx',
    'components/NotesPage.tsx',
    'components/ParseHistoryEditModal.tsx',
    'components/AnalysisPage.tsx',
    'components/AnalysisDetailPage.tsx'
  ];

  frontendFiles.forEach(file => {
    const content = readFile(join(frontendPath, file));
    if (content.includes(tableName) || content.includes(tableName.replace(/_/g, ''))) {
      usage.frontend = true;
      usage.locations.push(`frontend/${file}`);
    }
  });

  // 检查同步配置
  const syncContent = readFile(join(backendPath, 'services/turso-sync.js'));
  if (syncContent.includes(`'${tableName}'`) || syncContent.includes(`"${tableName}"`)) {
    usage.sync = true;
  }

  return usage;
}

// 主函数
function main() {
  console.log('📊 数据库表使用情况详细分析\n');
  console.log('='.repeat(80));
  
  const results = {};
  const usedTables = [];
  const unusedTables = [];
  
  ALL_TABLES.forEach(table => {
    const usage = checkTableUsage(table);
    results[table] = usage;
    
    const isUsed = usage.backend || usage.frontend;
    
    if (isUsed) {
      usedTables.push(table);
      console.log(`\n✅ ${table}`);
      console.log(`   后端: ${usage.backend ? '✓' : '✗'}`);
      console.log(`   前端: ${usage.frontend ? '✓' : '✗'}`);
      console.log(`   同步: ${usage.sync ? '✓' : '✗'}`);
      if (usage.locations.length > 0) {
        console.log(`   位置: ${usage.locations.join(', ')}`);
      }
    } else {
      unusedTables.push(table);
      console.log(`\n❌ ${table} - 未使用`);
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 总结:');
  console.log(`\n✅ 使用中的表 (${usedTables.length}):`);
  usedTables.forEach(table => console.log(`   - ${table}`));
  
  if (unusedTables.length > 0) {
    console.log(`\n❌ 未使用的表 (${unusedTables.length}):`);
    unusedTables.forEach(table => console.log(`   - ${table}`));
    console.log('\n⚠️  这些表可以安全删除（建议先备份数据）');
  } else {
    console.log('\n✅ 所有表都在使用中');
  }
  
  return { usedTables, unusedTables };
}

const { usedTables, unusedTables } = main();

// 导出结果供删除脚本使用
export { usedTables, unusedTables };

