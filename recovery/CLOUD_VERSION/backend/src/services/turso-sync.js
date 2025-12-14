/**
 * 将本地 SQLite 的数据按表同步到 Turso（libsql）
 * - 只读本地，失败不影响主流程
 * - 采用 updated_at/created_at 作为增量时间戳
 * - 优化：使用增量同步和批量操作，避免全表扫描
 */

const DEFAULT_INTERVAL_MS = Number(process.env.TURSO_SYNC_INTERVAL_MS || 30000);
const INITIAL_SYNC_DELAY_MS = Number(process.env.TURSO_INITIAL_SYNC_DELAY_MS || 10000); // 首次同步延迟10秒
const BATCH_SIZE = 100; // 批量操作大小

const TABLE_CONFIGS = [
  {
    name: 'notebooks',
    pk: 'notebook_id',
    conflictTarget: 'notebook_id',
    timestampColumn: 'updated_at',
    columns: ['notebook_id', 'name', 'description', 'note_count', 'component_config', 'created_at', 'updated_at']
  },
  {
    name: 'notes',
    pk: 'note_id',
    conflictTarget: 'note_id',
    timestampColumn: 'updated_at',
    columns: [
      'note_id',
      'notebook_id',
      'title',
      'content_text',
      'images',
      'image_urls',
      'source_url',
      'source',
      'original_url',
      'author',
      'upload_time',
      'component_data',
      'component_instances',
      'created_at',
      'updated_at'
    ]
  },
  {
    name: 'analysis_results',
    pk: 'id',
    conflictTarget: 'id',
    timestampColumn: 'updated_at',
    columns: ['id', 'notebook_id', 'notebook_type', 'mode', 'analysis_data', 'created_at', 'updated_at']
  },
  {
    name: 'ai_analysis_setting',
    pk: 'notebook_id',
    conflictTarget: 'notebook_id',
    timestampColumn: 'updated_at',
    columns: ['notebook_id', 'notebook_type', 'config_data', 'created_at', 'updated_at']
  },
  {
    name: 'article_parse_history',
    pk: 'id',
    conflictTarget: 'id',
    timestampColumn: 'updated_at', // 使用 updated_at，如果没有则用 created_at
    columns: [
      'id',
      'source_url',
      'parsed_content',
      'parsed_title',
      'parsed_summary',
      'parsed_source',
      'parsed_platform',
      'parsed_author',
      'parsed_published_at',
      'suggested_notebook_id',
      'suggested_notebook_name',
      'assigned_notebook_id',
      'assigned_notebook_name',
      'status',
      'parse_query',
      'coze_response_data',
      'parsed_fields',
      'tags',
      'notes',
      'note_ids',
      'created_at',
      'parsed_at',
      'updated_at'
    ]
  }
];

const safeTimestamp = (value) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getTimestampValue = (row, timestampColumn) => {
  // 对于 article_parse_history，优先使用 updated_at，如果没有则用 created_at
  if (timestampColumn === 'updated_at' && (!row.updated_at || row.updated_at === row.created_at)) {
    return row.created_at || row.parsed_at || null;
  }
  return row[timestampColumn] || row.created_at || null;
};

const buildUpsertSql = (table, columns, conflictTarget) => {
  const insertCols = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns
    .filter((col) => col !== conflictTarget)
    .map((col) => `${col}=excluded.${col}`)
    .join(', ');
  return `INSERT INTO ${table} (${insertCols}) VALUES (${placeholders}) ON CONFLICT(${conflictTarget}) DO UPDATE SET ${updates}`;
};

/**
 * 批量插入/更新（优化版本）
 */
async function upsertRowsBatch(remoteDb, table, columns, conflictTarget, rows) {
  if (!rows.length) return 0;
  
  // 如果只有少量数据，使用单条插入
  if (rows.length <= 10) {
    const sql = buildUpsertSql(table, columns, conflictTarget);
    for (const row of rows) {
      const args = columns.map((col) => (row[col] ?? null));
      await remoteDb.run(sql, args);
    }
    return rows.length;
  }
  
  // 批量处理
  const sql = buildUpsertSql(table, columns, conflictTarget);
  let processed = 0;
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    // 批量执行，但仍然是逐条插入（SQLite/Turso 的限制）
    // 但我们可以并行处理多个批次
    const promises = batch.map(row => {
      const args = columns.map((col) => (row[col] ?? null));
      return remoteDb.run(sql, args);
    });
    await Promise.all(promises);
    processed += batch.length;
  }
  
  return processed;
}

/**
 * 批量删除（优化版本）
 */
async function deleteRowsBatch(remoteDb, table, pk, ids) {
  if (!ids.length) return 0;
  
  // 如果只有少量数据，使用单条删除
  if (ids.length <= 10) {
    const sql = `DELETE FROM ${table} WHERE ${pk} = ?`;
    for (const id of ids) {
      await remoteDb.run(sql, [id]);
    }
    return ids.length;
  }
  
  // 批量删除：使用 IN 子句
  let processed = 0;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(', ');
    const sql = `DELETE FROM ${table} WHERE ${pk} IN (${placeholders})`;
    await remoteDb.run(sql, batch);
    processed += batch.length;
  }
  
  return processed;
}

/**
 * 增量同步：只同步最近更新的数据
 */
async function syncTableIncremental(localDb, remoteDb, config, lastSyncTime = null) {
  const { name: table, pk, conflictTarget, columns, timestampColumn } = config;
  try {
    const columnList = columns.join(', ');
    
    // 获取远程数据库的最大时间戳（用于增量同步）
    let maxRemoteTimestamp = 0;
    if (lastSyncTime) {
      // 如果提供了上次同步时间，使用它
      maxRemoteTimestamp = lastSyncTime;
    } else {
      // 否则查询远程数据库的最大时间戳
      try {
        const maxRemoteResult = await remoteDb.get(
          `SELECT MAX(COALESCE(${timestampColumn}, created_at)) as max_ts FROM ${table}`
        );
        if (maxRemoteResult?.max_ts) {
          maxRemoteTimestamp = safeTimestamp(maxRemoteResult.max_ts);
        }
      } catch (err) {
        // 如果查询失败（可能是表不存在），使用全量同步
        console.warn(`⚠️ [turso-sync] 无法获取 ${table} 的最大时间戳，使用全量同步:`, err.message);
      }
    }
    
    // 增量查询：只获取本地数据库中 updated_at > maxRemoteTimestamp 的记录
    // 或者首次同步时获取所有记录
    let localRows;
    if (maxRemoteTimestamp > 0) {
      // 增量同步：只获取更新的记录
      // 将时间戳转换为 ISO 8601 格式字符串进行比较
      const maxRemoteDate = new Date(maxRemoteTimestamp).toISOString();
      const timestampCondition = `COALESCE(${timestampColumn}, created_at) > ?`;
      localRows = await localDb.all(
        `SELECT ${columnList} FROM ${table} WHERE ${timestampCondition} ORDER BY COALESCE(${timestampColumn}, created_at) ASC`,
        [maxRemoteDate]
      );
    } else {
      // 首次同步：获取所有记录（但限制数量，避免一次性加载太多）
      localRows = await localDb.all(
        `SELECT ${columnList} FROM ${table} ORDER BY COALESCE(${timestampColumn}, created_at) ASC LIMIT 1000`
      );
    }
    
    if (!localRows || localRows.length === 0) {
      return { table, pushed: 0, deleted: 0, skipped: true };
    }
    
    // 获取需要同步的记录的 ID
    const localIds = new Set(localRows.map(row => row[pk]));
    
    // 只查询远程数据库中对应的记录（而不是全表）
    const remoteIds = Array.from(localIds);
    let remoteRows = [];
    if (remoteIds.length > 0) {
      // 分批查询远程数据
      for (let i = 0; i < remoteIds.length; i += BATCH_SIZE) {
        const batch = remoteIds.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(', ');
        const batchRows = await remoteDb.all(
          `SELECT ${columnList} FROM ${table} WHERE ${pk} IN (${placeholders})`,
          batch
        );
        remoteRows.push(...(batchRows || []));
      }
    }
    
    const remoteMap = new Map((remoteRows || []).map((row) => [row[pk], row]));
    
    // 比较并确定需要同步的数据
    const toUpsert = [];
    for (const row of localRows || []) {
      const remoteRow = remoteMap.get(row[pk]);
      const localTs = safeTimestamp(getTimestampValue(row, timestampColumn));
      const remoteTs = safeTimestamp(getTimestampValue(remoteRow, timestampColumn));
      
      if (!remoteRow || localTs > remoteTs) {
        toUpsert.push(row);
      }
      remoteMap.delete(row[pk]);
    }
    
    // 确定需要删除的记录（远程有但本地没有的）
    // 注意：为了安全，我们只在首次同步时检查删除，增量同步不删除
    const toDelete = maxRemoteTimestamp === 0 ? Array.from(remoteMap.keys()) : [];
    
    // 批量执行同步
    const pushed = await upsertRowsBatch(remoteDb, table, columns, conflictTarget, toUpsert);
    const deleted = await deleteRowsBatch(remoteDb, table, pk, toDelete);
    
    const maxLocalTimestamp = localRows.length > 0 
      ? Math.max(...localRows.map(row => safeTimestamp(getTimestampValue(row, timestampColumn))))
      : maxRemoteTimestamp;
    
    console.log(`🔄 [turso-sync] ${table} -> push ${pushed}, delete ${deleted}${maxRemoteTimestamp > 0 ? ' (增量)' : ' (全量)'}`);
    return { 
      table, 
      pushed, 
      deleted, 
      maxTimestamp: maxLocalTimestamp,
      incremental: maxRemoteTimestamp > 0
    };
  } catch (error) {
    console.error(`❌ [turso-sync] ${table} 同步失败:`, error?.message || error);
    return { table, error: error?.message || String(error) };
  }
}

/**
 * 执行一次同步（所有表）
 */
export async function syncOnce(localDb, remoteDb, lastSyncTimes = {}) {
  const results = [];
  const newSyncTimes = {};
  
  for (const config of TABLE_CONFIGS) {
    const lastSyncTime = lastSyncTimes[config.name] || null;
    const result = await syncTableIncremental(localDb, remoteDb, config, lastSyncTime);
    results.push(result);
    
    if (result.maxTimestamp) {
      newSyncTimes[config.name] = result.maxTimestamp;
    }
  }
  
  return { results, syncTimes: newSyncTimes };
}

/**
 * 启动周期同步（返回 stop/trigger 控制器）
 */
export function startTursoSync({ localDb, remoteDb, intervalMs = DEFAULT_INTERVAL_MS }) {
  if (!localDb || !remoteDb) {
    console.log('ℹ️ [turso-sync] Turso 未配置或未连接，不启动同步');
    return {
      stop: () => {},
      triggerSync: async () => []
    };
  }

  let timer = null;
  let stopped = false;
  let running = false;
  let lastSyncTimes = {}; // 记录每个表的上次同步时间戳
  let isFirstSync = true;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(run, intervalMs);
  };

  const run = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const { results, syncTimes } = await syncOnce(localDb, remoteDb, lastSyncTimes);
      lastSyncTimes = syncTimes; // 更新同步时间戳
      
      const pushed = results.reduce((sum, r) => sum + (r?.pushed || 0), 0);
      const deleted = results.reduce((sum, r) => sum + (r?.deleted || 0), 0);
      const incrementalCount = results.filter(r => r?.incremental).length;
      
      if (isFirstSync) {
        console.log(`✅ [turso-sync] 完成首次同步，推送 ${pushed} 条，删除 ${deleted} 条`);
        isFirstSync = false;
      } else {
        console.log(`✅ [turso-sync] 完成增量同步，推送 ${pushed} 条，删除 ${deleted} 条（${incrementalCount}/${results.length} 表使用增量）`);
      }
    } catch (error) {
      console.error('❌ [turso-sync] 同步循环失败:', error?.message || error);
    } finally {
      running = false;
      schedule();
    }
  };

  // 延迟首次同步，避免服务器启动时立即同步影响性能
  console.log(`⏰ [turso-sync] 将在 ${INITIAL_SYNC_DELAY_MS}ms 后开始首次同步`);
  setTimeout(() => {
    if (!stopped) {
      run();
    }
  }, INITIAL_SYNC_DELAY_MS);

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    triggerSync: run
  };
}

/**
 * 从 Turso 导入数据到本地数据库（反向同步）
 * 仅在本地数据库为空时执行
 * @param {object} localDb - 本地数据库实例
 * @param {object} remoteDb - Turso 数据库实例
 * @returns {Promise<object>} 导入结果统计
 */
export async function importFromTurso(localDb, remoteDb) {
  if (!localDb || !remoteDb) {
    console.log('ℹ️ [turso-import] 本地或远程数据库未连接，跳过导入');
    return { imported: 0, skipped: true };
  }

  try {
    console.log('🔄 [turso-import] 开始检查本地数据库是否为空...');
    
    // 检查本地数据库是否为空（检查所有表）
    let isLocalEmpty = true;
    for (const config of TABLE_CONFIGS) {
      try {
        const count = await localDb.get(`SELECT COUNT(*) as count FROM ${config.name}`);
        if (count && count.count > 0) {
          isLocalEmpty = false;
          console.log(`ℹ️ [turso-import] 本地数据库 ${config.name} 表已有 ${count.count} 条记录，跳过导入`);
          break;
        }
      } catch (err) {
        // 表可能不存在，继续检查其他表
        console.warn(`⚠️ [turso-import] 检查 ${config.name} 表时出错:`, err.message);
      }
    }

    if (!isLocalEmpty) {
      console.log('ℹ️ [turso-import] 本地数据库不为空，跳过导入');
      return { imported: 0, skipped: true, reason: 'local_db_not_empty' };
    }

    console.log('✅ [turso-import] 本地数据库为空，开始从 Turso 导入数据...');
    
    let totalImported = 0;
    const results = [];

    // 按顺序导入每个表（保持外键关系）
    for (const config of TABLE_CONFIGS) {
      const { name: table, pk, columns } = config;
      
      try {
        console.log(`📥 [turso-import] 正在导入 ${table} 表...`);
        
        // 从 Turso 获取所有数据
        const columnList = columns.join(', ');
        const remoteRows = await remoteDb.all(`SELECT ${columnList} FROM ${table} ORDER BY created_at ASC`);
        
        if (!remoteRows || remoteRows.length === 0) {
          console.log(`ℹ️ [turso-import] ${table} 表在 Turso 中为空，跳过`);
          results.push({ table, imported: 0, skipped: true });
          continue;
        }

        console.log(`📊 [turso-import] 从 Turso 获取到 ${remoteRows.length} 条 ${table} 记录`);

        // 批量插入到本地数据库
        const insertCols = columns.join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        const insertSql = `INSERT OR REPLACE INTO ${table} (${insertCols}) VALUES (${placeholders})`;
        
        let imported = 0;
        for (let i = 0; i < remoteRows.length; i += BATCH_SIZE) {
          const batch = remoteRows.slice(i, i + BATCH_SIZE);
          for (const row of batch) {
            try {
              const args = columns.map((col) => (row[col] ?? null));
              await localDb.run(insertSql, args);
              imported++;
            } catch (insertErr) {
              console.error(`❌ [turso-import] 插入 ${table} 记录失败:`, insertErr.message);
              // 继续处理其他记录
            }
          }
        }

        totalImported += imported;
        console.log(`✅ [turso-import] ${table} 表导入完成，共 ${imported} 条记录`);
        results.push({ table, imported, skipped: false });
      } catch (error) {
        console.error(`❌ [turso-import] 导入 ${table} 表失败:`, error?.message || error);
        results.push({ table, imported: 0, error: error?.message || String(error) });
      }
    }

    console.log(`✅ [turso-import] 导入完成，共导入 ${totalImported} 条记录`);
    return { 
      imported: totalImported, 
      skipped: false, 
      results 
    };
  } catch (error) {
    console.error('❌ [turso-import] 导入过程失败:', error?.message || error);
    return { 
      imported: 0, 
      skipped: false, 
      error: error?.message || String(error) 
    };
  }
}
