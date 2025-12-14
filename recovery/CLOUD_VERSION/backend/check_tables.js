import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '../../.env.local') });
dotenv.config({ path: join(__dirname, '../.env.local') });
dotenv.config();

async function checkTables() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.log('❌ Turso 环境变量未配置');
    return;
  }

  try {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });
    
    const result = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log('\n📊 Turso 数据库中的表：');
    console.log('='.repeat(50));
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row[0]}`);
    });
    console.log('='.repeat(50));
    console.log(`总计: ${result.rows.length} 个表\n`);
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

checkTables();
