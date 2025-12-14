/**
 * 删除 Turso 数据库中未使用的表（支持交互式输入环境变量）
 */

import { createClient } from '@libsql/client';
import readline from 'readline';

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

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function deleteUnusedTables() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // 尝试从环境变量获取
    let tursoUrl = process.env.TURSO_DATABASE_URL;
    let tursoToken = process.env.TURSO_AUTH_TOKEN;

    // 如果环境变量未配置，提示用户输入
    if (!tursoUrl) {
      tursoUrl = await askQuestion(rl, '请输入 TURSO_DATABASE_URL: ');
    }
    if (!tursoToken) {
      tursoToken = await askQuestion(rl, '请输入 TURSO_AUTH_TOKEN: ');
    }

    rl.close();

    if (!tursoUrl || !tursoToken) {
      console.error('❌ Turso 配置不完整');
      process.exit(1);
    }

    const client = createClient({
      url: tursoUrl,
      authToken: tursoToken
    });

    console.log('\n📊 连接 Turso 数据库...\n');

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

