/**
 * 检查数据库表的使用情况
 * 分析哪些表在前端/后端被使用，哪些表未被使用
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 从代码中定义的表
const ALL_TABLES = [
  'article_parse_history',
  'notebooks',
  'notes',
  'analysis_results',
  'ai_analysis_setting'
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
  
  const filesToCheck = [
    join(backendPath, 'server.js'),
    join(backendPath, 'routes/parse.js'),
    join(backendPath, 'services/turso-sync.js'),
    join(backendPath, 'lib/db.js'),
    join(frontendPath, 'apiClient.ts'),
    join(frontendPath, 'components/AINoteImportPage.tsx'),
    join(frontendPath, 'components/NotesPage.tsx'),
    join(frontendPath, 'components/ParseHistoryEditModal.tsx'),
  ];

  const usage = {
    backend: false,
    frontend: false,
    sync: false,
    apiEndpoints: []
  };

  // 检查后端使用
  const serverContent = readFile(join(backendPath, 'server.js'));
  const parseContent = readFile(join(backendPath, 'routes/parse.js'));
  
  if (serverContent.includes(tableName) || parseContent.includes(tableName)) {
    usage.backend = true;
    
    // 检查 API 端点
    const apiPattern = new RegExp(`app\\.(get|post|put|delete)\\(['"]/api/[^'"]*['"]`, 'g');
    const matches = [...serverContent.matchAll(apiPattern)];
    matches.forEach(match => {
      const endpoint = match[0];
      if (serverContent.includes(tableName)) {
        usage.apiEndpoints.push(endpoint);
      }
    });
  }

  // 检查前端使用
  const frontendFiles = [
    join(frontendPath, 'apiClient.ts'),
    join(frontendPath, 'components/AINoteImportPage.tsx'),
    join(frontendPath, 'components/NotesPage.tsx'),
    join(frontendPath, 'components/ParseHistoryEditModal.tsx'),
  ];
  
  frontendFiles.forEach(file => {
    const content = readFile(file);
    if (content.includes(tableName) || content.includes(tableName.replace(/_/g, ''))) {
      usage.frontend = true;
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
  console.log('📊 数据库表使用情况分析\n');
  console.log('='.repeat(80));
  
  const results = {};
  
  ALL_TABLES.forEach(table => {
    const usage = checkTableUsage(table);
    results[table] = usage;
    
    const isUsed = usage.backend || usage.frontend;
    const status = isUsed ? '✅ 使用中' : '❌ 未使用';
    
    console.log(`\n${status} ${table}`);
    console.log(`  - 后端使用: ${usage.backend ? '是' : '否'}`);
    console.log(`  - 前端使用: ${usage.frontend ? '是' : '否'}`);
    console.log(`  - 同步配置: ${usage.sync ? '是' : '否'}`);
    if (usage.apiEndpoints.length > 0) {
      console.log(`  - API端点: ${usage.apiEndpoints.length} 个`);
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 总结:');
  
  const usedTables = ALL_TABLES.filter(table => 
    results[table].backend || results[table].frontend
  );
  const unusedTables = ALL_TABLES.filter(table => 
    !results[table].backend && !results[table].frontend
  );
  
  console.log(`\n✅ 使用中的表 (${usedTables.length}):`);
  usedTables.forEach(table => console.log(`   - ${table}`));
  
  if (unusedTables.length > 0) {
    console.log(`\n❌ 未使用的表 (${unusedTables.length}):`);
    unusedTables.forEach(table => console.log(`   - ${table}`));
    console.log('\n⚠️  注意: 未使用的表可能仍然包含数据，删除前请先备份！');
  } else {
    console.log('\n✅ 所有表都在使用中，无需删除。');
  }
}

main();

