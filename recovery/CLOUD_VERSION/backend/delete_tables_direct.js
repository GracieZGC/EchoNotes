/**
 * 直接使用环境变量删除未使用的表
 * 不需要 Turso CLI 登录
 */

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
const envPaths = [
  '/Users/guanchenzhan/Desktop/VSCODE/个人网站/recovery/CLOUD_VERSION/.env.local',
  join(__dirname, '../../.env.local'),
  join(__dirname, '../.env.local'),
  join(__dirname, '.env.local'),
  '/Users/guanchenzhan/Desktop/VSCODE/个人网站/.env.local'
];

let envLoaded = false;
for (const envPath of envPaths) {
  try {
    dotenv.config({ path: envPath, override: true });
    envLoaded = true;
    break;
  } catch (error) {
    // 继续尝试下一个路径
  }
}

if (!envLoaded) {
  dotenv.config();
}

const UNUSED_TABLES = [
  'ai_data',
  'ai_enhanced_data',
  'ai_field_values',
  'ai_processed_data',
  'ai_prompts',
  'analysis_configs',
  'note_details',
  'raw_entries',
  'records'
];

async function deleteUnusedTables() {
  const tursoUrl = process.env.TURSO_DATABASE_URL || 'libsql://personal-website-data-gwen-z.aws-ap-northeast-1.turso.io';
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoToken) {
    console.error('❌ 请设置 TURSO_AUTH_TOKEN 环境变量');
    console.error('   或者在 .env.local 文件中配置');
    process.exit(1);
  }

  try {
    const client = createClient({
      url: tursoUrl,
      authToken: tursoToken
    });

    console.log('📊 连接 Turso 数据库...');
    console.log(`   数据库: ${tursoUrl}\n`);

    // 列出所有表
    const tablesResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    
    const existingTables = tablesResult.rows.map(row => row[0]);
    console.log(`找到 ${existingTables.length} 个表:\n`);
    existingTables.forEach((table, index) => {
      const isUnused = UNUSED_TABLES.includes(table);
      const marker = isUnused ? '❌' : '✅';
      console.log(`${marker} ${index + 1}. ${table}`);
    });

    // 找出需要删除的表
    const tablesToDelete = UNUSED_TABLES.filter(table => existingTables.includes(table));

    if (tablesToDelete.length === 0) {
      console.log('\n✅ 没有需要删除的表（所有未使用的表都不存在）');
      return;
    }

    console.log(`\n⚠️  准备删除 ${tablesToDelete.length} 个未使用的表:`);
    tablesToDelete.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table}`);
    });

    // 执行删除
    console.log('\n🗑️  开始删除表...\n');
    let deletedCount = 0;
    let errorCount = 0;

    for (const tableName of tablesToDelete) {
      try {
        // 先删除索引
        const indexesResult = await client.execute(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${tableName}'`
        );
        
        for (const indexRow of indexesResult.rows) {
          try {
            await client.execute(`DROP INDEX IF EXISTS ${indexRow[0]}`);
            console.log(`   ✓ 已删除索引: ${indexRow[0]}`);
          } catch (indexError) {
            // 忽略索引删除错误
          }
        }

        // 删除表
        await client.execute(`DROP TABLE IF EXISTS ${tableName}`);
        console.log(`✅ 已删除表: ${tableName}`);
        deletedCount++;
      } catch (error) {
        console.error(`❌ 删除表失败: ${tableName}`, error.message);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 删除完成:`);
    console.log(`   ✅ 成功: ${deletedCount} 个表`);
    if (errorCount > 0) {
      console.log(`   ❌ 失败: ${errorCount} 个表`);
    }

    // 再次列出剩余的表
    const remainingResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    console.log(`\n📋 剩余表 (${remainingResult.rows.length} 个):`);
    remainingResult.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row[0]}`);
    });

    // 验证应该只剩下5个使用中的表
    const expectedTables = ['ai_analysis_setting', 'analysis_results', 'article_parse_history', 'notebooks', 'notes'];
    const remainingTableNames = remainingResult.rows.map(row => row[0]);
    const allExpectedPresent = expectedTables.every(table => remainingTableNames.includes(table));
    
    if (allExpectedPresent && remainingTableNames.length === 5) {
      console.log('\n✅ 验证通过：只剩下5个使用中的表！');
    } else {
      console.log('\n⚠️  警告：表数量不符合预期');
    }

  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    if (error.message.includes('URL_INVALID')) {
      console.error('   请检查 TURSO_DATABASE_URL 是否正确');
    }
    if (error.message.includes('authentication') || error.message.includes('401')) {
      console.error('   请检查 TURSO_AUTH_TOKEN 是否正确');
    }
    process.exit(1);
  }
}

deleteUnusedTables();

