/**
 * 删除 Turso 数据库中未使用的表
 * 注意：此操作不可逆，请确保已备份数据
 */

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
const envPaths = [
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
    console.log(`✅ 已加载环境变量: ${envPath}`);
    break;
  } catch (error) {
    // 继续尝试下一个路径
  }
}

if (!envLoaded) {
  dotenv.config();
}

// 未使用的表列表
const UNUSED_TABLES = [
  'ai_data',
  'ai_enhanced_data',
  'ai_field_values',
  'ai_processed_data',
  'ai_prompts',
  'analysis_configs',
  'note_details',
  'raw_entries',
  'records',
  'simple_records'
];

async function deleteUnusedTables() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('❌ Turso 环境变量未配置');
    console.error('   需要: TURSO_DATABASE_URL 和 TURSO_AUTH_TOKEN');
    process.exit(1);
  }

  try {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });

    console.log('\n📊 开始检查 Turso 数据库...\n');

    // 首先列出所有表
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

    // 找出需要删除的表（在未使用列表中且实际存在）
    const tablesToDelete = UNUSED_TABLES.filter(table => existingTables.includes(table));

    if (tablesToDelete.length === 0) {
      console.log('\n✅ 没有需要删除的表（所有未使用的表都不存在）');
      return;
    }

    console.log(`\n⚠️  准备删除 ${tablesToDelete.length} 个未使用的表:`);
    tablesToDelete.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table}`);
    });

    console.log('\n⚠️  警告: 此操作不可逆！');
    console.log('   如果确定要继续，请修改脚本中的 CONFIRM_DELETE 为 true\n');

    // 安全措施：需要手动确认
    const CONFIRM_DELETE = true; // 改为 true 以执行删除

    if (!CONFIRM_DELETE) {
      console.log('❌ 删除操作已取消（CONFIRM_DELETE = false）');
      console.log('   如需执行删除，请将脚本中的 CONFIRM_DELETE 设置为 true');
      return;
    }

    // 执行删除
    console.log('🗑️  开始删除表...\n');
    let deletedCount = 0;
    let errorCount = 0;

    for (const tableName of tablesToDelete) {
      try {
        // 先删除索引（如果有）
        const indexesResult = await client.execute(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${tableName}'`
        );
        
        for (const indexRow of indexesResult.rows) {
          try {
            await client.execute(`DROP INDEX IF EXISTS ${indexRow[0]}`);
            console.log(`   ✓ 已删除索引: ${indexRow[0]}`);
          } catch (indexError) {
            console.warn(`   ⚠️  删除索引失败: ${indexRow[0]}`, indexError.message);
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

  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    if (error.message.includes('URL_INVALID')) {
      console.error('   请检查 TURSO_DATABASE_URL 是否正确');
    }
    if (error.message.includes('authentication')) {
      console.error('   请检查 TURSO_AUTH_TOKEN 是否正确');
    }
    process.exit(1);
  }
}

deleteUnusedTables();

