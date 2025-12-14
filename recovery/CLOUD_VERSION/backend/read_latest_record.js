
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'data.db');

try {
    console.log(`🔍 Accessing database at: ${dbPath}`);
    const db = new Database(dbPath, { readonly: true });

    const stmt = db.prepare('SELECT id, parsed_at, parsed_content, parsed_fields, status FROM article_parse_history ORDER BY parsed_at DESC LIMIT 1');
    const record = stmt.get();

    if (record) {
        console.log('✅ Successfully fetched record:');
        console.log(JSON.stringify(record, null, 2));
    } else {
        console.log('⚠️ No records found in article_parse_history table.');
    }

    db.close();

} catch (error) {
    console.error('❌ Error executing script:', error);
}
