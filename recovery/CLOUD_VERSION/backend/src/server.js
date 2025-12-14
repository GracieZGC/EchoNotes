/**
 * 后端服务器主入口
 * 集成解析功能、数据库连接等
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './lib/db.js';
import { initParseRoutes } from './routes/parse.js';
import AIService from './services/ai-service.js';
import { startTursoSync, importFromTurso } from './services/turso-sync.js';
import { sanitizeString } from './lib/string-utils.js';
import {
  buildDefaultFieldTemplate,
  sanitizeTemplateSource,
  normalizeTemplateFields,
  buildTemplateResponse,
  getFieldTemplateForNotebook,
  saveFieldTemplateForNotebook,
  getLastUsedNotebookForSource,
  setLastUsedNotebookForSource,
  FIELD_TEMPLATE_DEFINITIONS
} from './lib/field-templates.js';

// 全局捕获，排查进程退出原因
process.on('exit', (code) => {
  console.error(`⚠️ 进程即将退出，exit code=${code}`);
});
process.on('uncaughtException', (err) => {
  console.error('❌ 未捕获异常导致进程退出:', err);
  console.error(err?.stack || '');
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
  console.error('  promise:', promise);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量（优先加载 .env.local）
// 尝试多个可能的路径
const envPaths = [
  path.join(__dirname, '../../.env.local'),     // backend/src -> backend -> CLOUD_VERSION/.env.local
  path.join(__dirname, '../.env.local'),        // backend/src -> backend/.env.local
  path.join(__dirname, '../../../../.env.local'), // backend/src -> recovery/.env.local（项目根）
  '/Users/guanchenzhan/Desktop/VSCODE/个人网站/recovery/CLOUD_VERSION/.env.local', // 绝对路径（防路径计算错误）
  '/Users/guanchenzhan/Desktop/VSCODE/个人网站/.env.local' // 项目根层
];

let envLoaded = false;
for (const envPath of envPaths) {
  try {
    const result = dotenv.config({ path: envPath, override: true });
    if (!result.error) {
      console.log(`✅ 已加载环境变量: ${envPath}`);
      envLoaded = true;
      break;
    }
  } catch (error) {
    // 继续尝试下一个路径
  }
}

if (!envLoaded) {
  console.warn('⚠️ 未找到 .env.local 文件，尝试加载默认 .env');
  dotenv.config(); // 如果 .env.local 不存在，则加载默认的 .env
}

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
// 捕获原始请求体，便于在 body 解析失败时兜底解析
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    // 保存原始字符串，后续可用于手动解析
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 全局变量
let db = null;
let tursoClient = null;
let tursoSyncController = null;
const TURSO_SYNC_INTERVAL_MS = Number(process.env.TURSO_SYNC_INTERVAL_MS || 30000);

const NOTE_FIELDS =
  'note_id, notebook_id, title, content_text, images, image_urls, source_url, source, original_url, author, upload_time, component_data, component_instances, created_at, updated_at';

const normalizeBoolean = (value) => {
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const generateNoteId = () => `note_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const generateId = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const generateComponentId = (type = 'text-short') =>
  `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const normalizeComponentInstances = (instances) => {
  if (!Array.isArray(instances)) return [];
  return instances
    .filter(item => item && typeof item === 'object')
    .map((item) => {
      const type = sanitizeString(item.type || 'text-short', 'text-short');
      return {
        id: sanitizeString(item.id, generateComponentId(type)) || generateComponentId(type),
        type,
        title: sanitizeString(item.title || ''),
        config: item.config && typeof item.config === 'object' ? item.config : {},
        dataMapping: item.dataMapping && typeof item.dataMapping === 'object' ? item.dataMapping : {}
      };
    });
};

const buildDefaultComponentConfig = () => {
  const defaults = [
    { type: 'text-short', title: '标题' },
    { type: 'text-long', title: '正文' },
    { type: 'date', title: '日期' }
  ];

  return JSON.stringify({
    componentInstances: defaults.map((item) => ({
      id: generateComponentId(item.type),
      type: item.type,
      title: item.title,
      config: {},
      dataMapping: {}
    }))
  });
};

const resolveNotebookComponentConfig = (rawConfig) => {
  if (!rawConfig) {
    return buildDefaultComponentConfig();
  }

  let normalized = rawConfig;
  if (typeof rawConfig === 'string') {
    try {
      normalized = JSON.parse(rawConfig);
    } catch (error) {
      console.warn('Failed to parse incoming component_config:', error);
      normalized = null;
    }
  }

  if (normalized && typeof normalized === 'object') {
    const candidateInstances =
      Array.isArray(normalized.componentInstances)
        ? normalized.componentInstances
        : Array.isArray(normalized.instances)
          ? normalized.instances
          : Array.isArray(normalized)
            ? normalized
            : [];

    const sanitized = normalizeComponentInstances(candidateInstances);
    if (sanitized.length > 0) {
      return JSON.stringify({ componentInstances: sanitized });
    }
  }

  return buildDefaultComponentConfig();
};

const parseComponentConfigValue = (rawConfig) => {
  if (!rawConfig) return null;
  if (typeof rawConfig === 'string') {
    try {
      return JSON.parse(rawConfig);
    } catch (error) {
      console.warn('Failed to parse component_config:', error);
      return null;
    }
  }
  if (typeof rawConfig === 'object') {
    return rawConfig;
  }
  return null;
};

const ensureTemplateInstances = (instances = []) => {
  return normalizeComponentInstances(instances).map((instance) => ({
    id: instance.id || generateComponentId(instance.type),
    type: instance.type,
    title: instance.title || getComponentTitle(instance.type),
    config: instance.config || {},
    dataMapping: instance.dataMapping || {}
  }));
};

const mergeComponentInstances = (templateInstances = [], existingInstances = []) => {
  const sanitizedTemplate = ensureTemplateInstances(templateInstances);
  const mapping = {};
  const usedTemplateIndexes = new Set();

  (Array.isArray(existingInstances) ? existingInstances : []).forEach((existing) => {
    const matchIndex = sanitizedTemplate.findIndex(
      (template, idx) => !usedTemplateIndexes.has(idx) && template.type === existing.type
    );
    if (matchIndex >= 0 && existing?.id) {
      mapping[existing.id] = sanitizedTemplate[matchIndex].id;
      usedTemplateIndexes.add(matchIndex);
    }
  });

  return { instances: sanitizedTemplate, idMapping: mapping };
};

const safeJsonParse = (value, fallback = null) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('⚠️ safeJsonParse 解析失败:', error?.message || error);
    return fallback;
  }
};

const getComponentTitle = (type) => {
  const record = [
    { id: 'text-short', label: '短文本' },
    { id: 'text-long', label: '长文本' },
    { id: 'date', label: '日期' },
    { id: 'number', label: '数字' },
    { id: 'image', label: '图片' },
    { id: 'video', label: '视频' },
    { id: 'audio', label: '音频' },
    { id: 'file', label: '文件' },
    { id: 'ai-custom', label: 'AI 摘要' },
    { id: 'chart', label: '图表' }
  ];
  const entry = record.find((item) => item.id === type);
  return entry ? entry.label : '未命名组件';
};

const aiService = new AIService();

const isMeaningfulText = (value) => {
  if (value === null || value === undefined) return false;
  const text = typeof value === 'string' ? value : String(value || '');
  return text.trim().length > 0;
};

// ====== Analysis V2 辅助工具：情绪相关字段推导（与前端保持一致） ======

const MOOD_SOURCE_PRESETS = [
  { label: '工作', keywords: ['工作', '项目', '加班', '老板', '同事', '任务'] },
  { label: '朋友', keywords: ['朋友', '同学', '聚会', '社交', '聊天'] },
  { label: '家人', keywords: ['家人', '父母', '孩子', '家庭'] },
  { label: '健康', keywords: ['健康', '身体', '锻炼', '运动', '生病'] },
  { label: '成长', keywords: ['学习', '成长', '自我', '阅读'] }
];

const formatDateLabelForAnalysis = (value) => {
  if (!value) return '未命名日期';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value.slice(0, 10) : '未命名日期';
  }
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date);
};

const hashString = (input) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const detectScoreFromText = (text) => {
  if (!text) return null;
  const directMatch = text.match(/([0-9]{1,2}(?:\.[0-9]+)?)\s*分/);
  if (directMatch) {
    return Math.min(10, Math.max(1, parseFloat(directMatch[1])));
  }
  const scoreMatch = text.match(/score\s*[:：]\s*([0-9]{1,2}(?:\.[0-9]+)?)/i);
  if (scoreMatch) {
    return Math.min(10, Math.max(1, parseFloat(scoreMatch[1])));
  }
  return null;
};

const detectMoodSource = (text) => {
  if (!text) return '其他';
  const lowered = text.toLowerCase();
  for (const preset of MOOD_SOURCE_PRESETS) {
    const hit = preset.keywords.some(
      (keyword) => lowered.includes(keyword) || text.includes(keyword)
    );
    if (hit) return preset.label;
  }
  return '其他';
};

const extractKeywords = (text) => {
  if (!text) return [];
  const chineseMatches = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  const englishMatches = text.match(/[A-Za-z]{4,}/g) || [];
  const merged = [...chineseMatches, ...englishMatches]
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = [];
  merged.forEach((word) => {
    if (!unique.includes(word)) unique.push(word);
  });
  return unique.slice(0, 8);
};

const AI_MOOD_FIELD_CONFIG = {
  mood_score: {
    name: '情绪分数',
    role: 'metric',
    dataType: 'number'
  },
  mood_category: {
    name: '情绪类别',
    role: 'dimension',
    dataType: 'category'
  },
  mood_source: {
    name: '情绪来源',
    role: 'dimension',
    dataType: 'category'
  },
  mood_keywords: {
    name: '情绪关键词',
    role: 'dimension',
    dataType: 'text'
  }
};

const buildMoodAnalysisDataset = (notes = []) => {
  if (!Array.isArray(notes)) return [];
  return notes.map((note, index) => {
    const textBlob = [
      note.title,
      note.summary,
      note.content_text,
      note.content,
      note.component_data_text
    ]
      .filter(Boolean)
      .join(' ');
    const detectedScore = detectScoreFromText(textBlob);
    const fallbackSeed = note.note_id || note.id || `${index}`;
    const pseudoScore = (hashString(fallbackSeed + textBlob.slice(0, 12)) % 10) + 1;
    const finalScore = detectedScore ?? pseudoScore;
    const scoreValue = Number(finalScore.toFixed(2));
    const dateRaw = note.created_at || note.updated_at || new Date().toISOString();
    const dateObj = new Date(dateRaw);
    const label = formatDateLabelForAnalysis(dateObj);
    const keywords = extractKeywords(textBlob);
    const moodSource = detectMoodSource(textBlob);
    return {
      id: note.note_id || note.id || `note-${index}`,
      dateLabel: label,
      dateRaw: Number.isNaN(dateObj.getTime()) ? new Date() : dateObj,
      moodScore: scoreValue,
      moodCategory: scoreValue >= 7 ? '积极' : scoreValue >= 4 ? '中性' : '消极',
      moodSource,
      moodKeywords: keywords
    };
  });
};

const normalizeParseFields = (parseFields) => {
  if (Array.isArray(parseFields) && parseFields.length) {
    return Array.from(new Set(parseFields.map((f) => String(f).toLowerCase()))).filter(Boolean);
  }
  return ['summary', 'keywords'];
};

const ensureComponent = (instances, id, title, type, source = '') => {
  const found = (instances || []).find(
    (inst) =>
      inst?.id === id ||
      (inst?.dataMapping && inst.dataMapping.source === source) ||
      String(inst?.title || '').toLowerCase() === String(title || '').toLowerCase()
  );
  if (found) return found.id || id;
  const newInst = {
    id,
    type,
    title,
    config: {},
    dataMapping: source ? { source } : {}
  };
  instances.push(newInst);
  return newInst.id;
};

async function generateKeywordsAndSummaryForNote({
  noteId,
  title,
  content,
  componentData = {},
  componentInstances = [],
  needSummary = true,
  needKeywords = true
}) {
  try {
    const hasTitle = isMeaningfulText(title);
    const hasContent = isMeaningfulText(content);
    if (!hasTitle && !hasContent) {
      console.warn('⚠️ 标题和正文都为空，跳过AI解析');
      return;
    }

    const combined = [
      hasTitle ? `标题：${String(title).trim()}` : '',
      hasContent ? `正文：${String(content).trim()}` : ''
    ]
      .filter(Boolean)
      .join('\n\n');

    const prompt = `请分析以下笔记内容，生成关键词和摘要：

${combined}

请按以下格式返回纯JSON（不要包含任何其他文字或markdown代码块）：
{
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "summary": "一句话摘要，简洁概括主要内容，不超过100字"
}

要求：
1. keywords 为字符串数组，3-5 个关键词，准确反映主题
2. summary 为一句话，简洁明了，不超过100字
3. 如果内容较少，可减少关键词数量`;

    let keywords = [];
    let summary = '';

    try {
      const aiResponse = await aiService.generateText(prompt, { temperature: 0.4, maxTokens: 500 });
      let cleaned = aiResponse.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/```json\s*/i, '').replace(/```\s*$/, '');
      else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```\s*/i, '').replace(/```\s*$/, '');
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.keywords)) {
        keywords = parsed.keywords.map((k) => String(k || '').trim()).filter(Boolean);
      }
      if (isMeaningfulText(parsed.summary)) {
        summary = String(parsed.summary).trim();
      }
    } catch (aiError) {
      console.warn('⚠️ AI 解析失败，使用兜底:', aiError?.message || aiError);
    }

    if (needKeywords && !keywords.length) {
      // 简易兜底关键词
      const words = combined
        .replace(/[^\u4e00-\u9fa5\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.trim().length >= 2);
      keywords = Array.from(new Set(words)).slice(0, 5);
    }

    if (needSummary && !isMeaningfulText(summary)) {
      summary = combined.slice(0, 80) || '待生成';
    }

    if (!needKeywords) keywords = [];
    if (!needSummary) summary = '';

    // 更新组件数据
    const updatedData = { ...(componentData || {}) };
    const updatedInstances = Array.isArray(componentInstances) ? [...componentInstances] : [];

    if (keywords.length && needKeywords) {
      const kwId = ensureComponent(updatedInstances, 'keywords', '关键词', 'tag', 'keywords');
      updatedData[kwId] = {
        ...(updatedData[kwId] || {}),
        type: 'tag',
        title: updatedData[kwId]?.title || '关键词',
        value: keywords.join(', '),
        items: keywords
      };
    } else if (needKeywords) {
      const kwId = ensureComponent(updatedInstances, 'keywords', '关键词', 'tag', 'keywords');
      updatedData[kwId] = {
        ...(updatedData[kwId] || {}),
        type: 'tag',
        title: updatedData[kwId]?.title || '关键词',
        value: '待生成'
      };
    }

    if (needSummary && isMeaningfulText(summary)) {
      const sumId = ensureComponent(updatedInstances, 'summary', 'AI 摘要', 'text-long', 'summary');
      updatedData[sumId] = {
        ...(updatedData[sumId] || {}),
        type: 'text-long',
        title: updatedData[sumId]?.title || 'AI 摘要',
        value: summary
      };
    } else if (needSummary) {
      const sumId = ensureComponent(updatedInstances, 'summary', 'AI 摘要', 'text-long', 'summary');
      updatedData[sumId] = {
        ...(updatedData[sumId] || {}),
        type: 'text-long',
        title: updatedData[sumId]?.title || 'AI 摘要',
        value: '待生成'
      };
    }

    const now = new Date().toISOString();
    await db.run(
      'UPDATE notes SET component_data = ?, component_instances = ?, updated_at = ? WHERE note_id = ?',
      [JSON.stringify(updatedData), JSON.stringify(updatedInstances), now, noteId]
    );
    console.log('✅ AI 解析结果已写入笔记:', noteId, {
      keywordsCount: keywords.length,
      hasSummary: isMeaningfulText(summary)
    });
  } catch (error) {
    console.error('❌ 生成关键词和摘要失败:', error);
  }
}

async function getNotebookById(notebookId) {
  if (!db) return null;
  return await db.get(
    'SELECT notebook_id, name, description, note_count, component_config, created_at, updated_at FROM notebooks WHERE notebook_id = ?',
    [notebookId]
  );
}

async function updateNotebookNoteCount(notebookId) {
  if (!db || !notebookId) return;
  const stats = await db.get('SELECT COUNT(*) as count FROM notes WHERE notebook_id = ?', [notebookId]);
  const now = new Date().toISOString();
  await db.run(
    'UPDATE notebooks SET note_count = ?, updated_at = ? WHERE notebook_id = ?',
    [stats?.count ?? 0, now, notebookId]
  );
}

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'backend running',
    database: db ? 'connected' : 'not connected',
    tursoSync: tursoClient ? 'enabled' : 'disabled',
    tursoSyncIntervalMs: tursoClient ? TURSO_SYNC_INTERVAL_MS : 0
  });
});

// 获取笔记本列表
// 健康检查端点（快速响应，不依赖数据库）
app.get('/api/health', (_req, res) => {
  res.json({ 
    success: true, 
    status: 'ok',
    timestamp: new Date().toISOString(),
    dbConnected: !!db
  });
});

// 获取笔记本列表
app.get('/api/notebooks', async (_req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: '数据库未连接' 
      });
    }

    try {
      // 添加查询超时和限制，确保快速响应
      const queryStartTime = Date.now();
      
      // 使用更短的超时时间（2秒），如果超时立即返回空列表
      let notebooks = [];
      try {
        notebooks = await Promise.race([
          db.all(
            'SELECT notebook_id, name, description, note_count, component_config, created_at, updated_at FROM notebooks ORDER BY updated_at DESC LIMIT 1000'
          ),
          new Promise((resolve) => {
            setTimeout(() => {
              console.warn('⚠️ /api/notebooks 查询超时（2秒），返回空列表');
              resolve([]);
            }, 2000);
          })
        ]);
      } catch (queryErr) {
        console.error('❌ 查询 notebooks 出错:', queryErr?.message || queryErr);
        notebooks = [];
      }

      const queryTime = Date.now() - queryStartTime;
      if (queryTime > 500) {
        console.warn(`⚠️ /api/notebooks 查询耗时 ${queryTime}ms`);
      }

      return res.json({
        success: true,
        data: notebooks || []
      });
    } catch (queryError) {
      // 如果这里因为 Turso/网络问题抛出 fetch failed，不要让前端 500，
      // 而是返回一个空列表，并在后台打印错误以便排查。
      console.error('❌ 查询 notebooks 失败，返回空列表:', queryError?.message || queryError);
      return res.json({
        success: true,
        data: [],
        fallback: true,
        message: queryError?.message || 'notebooks query failed, fallback to empty list'
      });
    }
  } catch (error) {
    console.error('❌ 获取笔记本列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取笔记本列表失败'
    });
  }
});

// 获取指定笔记本的笔记
app.get('/api/notes', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({
        success: false,
        error: '数据库未连接'
      });
    }

    let notebookId = sanitizeString(req.query?.notebook_id || req.query?.notebookId);
    if (!notebookId) {
      return res.status(400).json({
        success: false,
        message: '请提供 notebook_id'
      });
    }

    const queryStartTime = Date.now();
    
    // 获取笔记本信息（带超时保护）
    let notebook;
    let requestedNotebookId = notebookId;
    let fallbackUsed = false;
    try {
      notebook = await Promise.race([
        getNotebookById(notebookId),
        new Promise((resolve) => {
          setTimeout(() => {
            console.warn(`⚠️ /api/notes getNotebookById 超时（2秒）`);
            resolve(null);
          }, 2000);
        })
      ]);
    } catch (notebookErr) {
      console.error('❌ 获取笔记本信息出错:', notebookErr?.message || notebookErr);
      notebook = null;
    }

    if (!notebook) {
      // 如果请求的笔记本不存在，尝试使用已有的第一个笔记本兜底
      const fallbackNotebook = await db.get(
        'SELECT notebook_id, name, description, note_count, component_config, created_at, updated_at FROM notebooks ORDER BY created_at ASC LIMIT 1'
      );
      if (fallbackNotebook) {
        console.warn(`⚠️ 请求的笔记本不存在 (${requestedNotebookId})，使用第一个笔记本兜底: ${fallbackNotebook.notebook_id}`);
        notebook = fallbackNotebook;
        notebookId = fallbackNotebook.notebook_id;
        fallbackUsed = true;
      } else {
        // 如果库里没有任何笔记本，自动创建一个默认笔记本，避免前端直接报错
        const now = new Date().toISOString();
        const autoNotebookId = `notebook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const defaultName = '通用笔记';
        const defaultConfig = buildDefaultComponentConfig();
        await db.run(
          `
            INSERT INTO notebooks (notebook_id, name, description, note_count, component_config, created_at, updated_at)
            VALUES (?, ?, ?, 0, ?, ?, ?)
          `,
          [autoNotebookId, defaultName, '系统自动创建的默认笔记本', defaultConfig, now, now]
        );
        console.warn(`⚠️ 未找到任何笔记本，已自动创建默认笔记本: ${autoNotebookId}`);
        notebook = {
          notebook_id: autoNotebookId,
          name: defaultName,
          description: '系统自动创建的默认笔记本',
          note_count: 0,
          component_config: defaultConfig,
          created_at: now,
          updated_at: now
        };
        notebookId = autoNotebookId;
        fallbackUsed = true;
      }
    }

    // 查询笔记（带超时保护，3秒超时）
    let notes = [];
    try {
      notes = await Promise.race([
        db.all(
          `SELECT ${NOTE_FIELDS} FROM notes WHERE notebook_id = ? ORDER BY updated_at DESC`,
          [notebookId]
        ),
        new Promise((resolve) => {
          setTimeout(() => {
            console.warn('⚠️ /api/notes 查询超时（3秒），返回空列表');
            resolve([]);
          }, 3000);
        })
      ]);
    } catch (queryErr) {
      // 检查是否是超时或网络错误
      const isTimeoutError = queryErr?.message?.includes('timeout') ||
                            queryErr?.message?.includes('TIMEOUT') ||
                            queryErr?.message?.includes('fetch failed') ||
                            queryErr?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
                            queryErr?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';
      
      if (isTimeoutError) {
        console.warn('⚠️ /api/notes Turso 查询超时，返回空列表');
        notes = [];
      } else {
        console.error('❌ /api/notes 查询出错:', queryErr?.message || queryErr);
        notes = [];
      }
    }

    const queryTime = Date.now() - queryStartTime;
    if (queryTime > 1000) {
      console.warn(`⚠️ /api/notes 查询耗时 ${queryTime}ms`);
    }

    const normalizedNotes = (notes || []).map((note) => {
      const parsedData = safeJsonParse(note.component_data) || {};
      const parsedInstances = safeJsonParse(note.component_instances, []) || [];
      return {
        ...note,
        component_data: parsedData,
        component_instances: parsedInstances
      };
    });

    res.json({
      success: true,
      notebook,
      notes: normalizedNotes,
      fallback_used: fallbackUsed,
      requested_notebook_id: requestedNotebookId,
      resolved_notebook_id: notebook?.notebook_id || null
    });
  } catch (error) {
    console.error('❌ 获取笔记失败:', error);
    
    // 检查是否是超时或网络错误，如果是则返回空列表而不是 500
    const isTimeoutError = error?.message?.includes('timeout') || 
                          error?.message?.includes('TIMEOUT') ||
                          error?.message?.includes('fetch failed') ||
                          error?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
                          error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';
    
    if (isTimeoutError) {
      return res.json({
        success: true,
        notebook: null,
        notes: [],
        fallback: true,
        message: '数据库查询超时，已返回空列表'
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || '获取笔记失败'
    });
  }
});

// 获取单条笔记详情（兼容旧版 NoteDetailPage 调用）
app.get('/api/note-detail-data', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({
        success: false,
        error: '数据库未连接'
      });
    }

    const rawId = req.query?.id || req.query?.note_id || req.query?.noteId;
    const noteId = sanitizeString(rawId);

    if (!noteId) {
      return res.status(400).json({
        success: false,
        error: '请提供笔记 ID（id 或 note_id）'
      });
    }

    const note = await db.get(
      `SELECT ${NOTE_FIELDS} FROM notes WHERE note_id = ?`,
      [noteId]
    );

    if (!note) {
      return res.status(404).json({
        success: false,
        error: '笔记不存在'
      });
    }

    const notebook = await getNotebookById(note.notebook_id);

    res.json({
      success: true,
      note,
      notebook: notebook || null
    });
  } catch (error) {
    console.error('❌ 获取笔记详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取笔记详情失败'
    });
  }
});

// 创建笔记
app.post('/api/notes', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({
        success: false,
        error: '数据库未连接'
      });
    }

  const {
    notebook_id,
    title,
    content_text,
    component_data,
    component_instances,
    source_url,
    skipAI = false,
    parseFields
  } = req.body || {};
  const notebookId = sanitizeString(notebook_id);

    if (!notebookId) {
      return res.status(400).json({ success: false, message: '请提供 notebook_id' });
    }

    const notebook = await getNotebookById(notebookId);
    if (!notebook) {
      return res.status(404).json({ success: false, message: '笔记本不存在' });
    }

    const resolvedTitle = sanitizeString(title, '未命名笔记') || '未命名笔记';
    const resolvedContent = sanitizeString(content_text);
    if (!resolvedTitle && !resolvedContent) {
      return res.status(400).json({ success: false, message: '请至少提供标题或内容' });
    }

  const noteId = generateNoteId();
  const now = new Date().toISOString();

    await db.run(
      `
        INSERT INTO notes (
          note_id,
          notebook_id,
          title,
          content_text,
          images,
          image_urls,
          source_url,
          source,
          original_url,
          author,
          upload_time,
          component_data,
          component_instances,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        noteId,
        notebookId,
        resolvedTitle,
        resolvedContent,
        null,
        null,
        sanitizeString(source_url) || null,
        sanitizeString(source) || null,
        sanitizeString(original_url) || null,
        sanitizeString(author) || null,
        sanitizeString(upload_time) || null,
        component_data ? JSON.stringify(component_data) : null,
        component_instances ? JSON.stringify(component_instances) : null,
        now,
        now
      ]
    );

    await updateNotebookNoteCount(notebookId);

  // AI 触发逻辑
  const normalizedParseFields = normalizeParseFields(parseFields);
  const wantSummary = normalizedParseFields.includes('summary');
  const wantKeywords = normalizedParseFields.includes('keywords');
  const wantAI = !skipAI && (wantSummary || wantKeywords);

  const parsedComponentData =
    component_data && typeof component_data === 'object'
      ? component_data
      : component_data && typeof component_data === 'string'
        ? (() => {
            try { return JSON.parse(component_data); } catch { return {}; }
          })()
        : {};
  const parsedComponentInstances = Array.isArray(component_instances) ? component_instances : [];

  const hasUserSummary = Object.values(parsedComponentData || {}).some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const titleLower = String(entry.title || '').toLowerCase();
    const sourceLower = String(entry.sourceField || '').toLowerCase();
    return (titleLower.includes('摘要') || titleLower.includes('summary') || sourceLower === 'summary') &&
      isMeaningfulText(entry.value);
  });
  const hasUserKeywords = Object.values(parsedComponentData || {}).some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const titleLower = String(entry.title || '').toLowerCase();
    const sourceLower = String(entry.sourceField || '').toLowerCase();
    return (titleLower.includes('关键词') || titleLower.includes('keyword') || sourceLower === 'keywords') &&
      isMeaningfulText(entry.value);
  });

  if (
    wantAI &&
    (isMeaningfulText(resolvedTitle) || isMeaningfulText(resolvedContent)) &&
    (!hasUserSummary || !hasUserKeywords)
  ) {
    // 异步 AI 生成，不阻塞创建
    generateKeywordsAndSummaryForNote({
      noteId,
      title: resolvedTitle,
      content: resolvedContent,
      componentData: parsedComponentData,
      componentInstances: parsedComponentInstances,
      needSummary: wantSummary && !hasUserSummary,
      needKeywords: wantKeywords && !hasUserKeywords
    }).catch((err) => {
      console.error('❌ 后台AI解析失败（不影响笔记创建）:', err);
    });
  } else if (wantAI && !isMeaningfulText(resolvedTitle) && !isMeaningfulText(resolvedContent)) {
    // 没有内容也想要AI时，标记待生成
    const placeholderData = {
      ...parsedComponentData,
      summary: {
        type: 'text-long',
        title: 'AI 摘要',
        value: '待生成'
      },
      keywords: {
        type: 'tag',
        title: '关键词',
        value: '待生成'
      }
    };
    await db.run(
      'UPDATE notes SET component_data = ?, updated_at = ? WHERE note_id = ?',
      [JSON.stringify(placeholderData), new Date().toISOString(), noteId]
    );
  }

  res.status(201).json({
    success: true,
    note: {
      note_id: noteId,
      notebook_id: notebookId,
      title: resolvedTitle,
      content_text: resolvedContent,
      source_url: sanitizeString(source_url) || null,
      component_data: component_data || null,
      component_instances: component_instances || null,
      status: 'success',
      created_at: now,
      updated_at: now
    }
  });
  } catch (error) {
    console.error('❌ 创建笔记失败:', error);
    res.status(500).json({ success: false, message: error.message || '创建笔记失败' });
  }
});

// 重命名笔记
app.post('/api/note-rename', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }
    const { id, title } = req.body || {};
    const noteId = sanitizeString(id);
    if (!noteId || !title) {
      return res.status(400).json({ success: false, message: '请提供笔记ID和新标题' });
    }
    const now = new Date().toISOString();
    await db.run('UPDATE notes SET title = ?, updated_at = ? WHERE note_id = ?', [sanitizeString(title), now, noteId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ 重命名笔记失败:', error);
    res.status(500).json({ success: false, message: error.message || '重命名笔记失败' });
  }
});

// 删除单个笔记
app.post('/api/note-delete', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }
    const { id } = req.body || {};
    const noteId = sanitizeString(id);
    if (!noteId) {
      return res.status(400).json({ success: false, message: '请提供笔记ID' });
    }

    const note = await db.get('SELECT notebook_id FROM notes WHERE note_id = ?', [noteId]);
    if (!note) {
      return res.status(404).json({ success: false, message: '笔记不存在' });
    }

    await db.run('DELETE FROM notes WHERE note_id = ?', [noteId]);
    await updateNotebookNoteCount(note.notebook_id);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ 删除笔记失败:', error);
    res.status(500).json({ success: false, message: error.message || '删除笔记失败' });
  }
});

// 批量删除笔记
app.post('/api/notes-batch-delete', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }

    const noteIds = Array.isArray(req.body?.note_ids) ? req.body.note_ids.filter(Boolean) : [];
    if (noteIds.length === 0) {
      return res.status(400).json({ success: false, message: '请提供要删除的笔记ID列表' });
    }

    const placeholders = noteIds.map(() => '?').join(',');
    const notes = await db.all(
      `SELECT DISTINCT notebook_id FROM notes WHERE note_id IN (${placeholders})`,
      noteIds
    );

    await db.run(`DELETE FROM notes WHERE note_id IN (${placeholders})`, noteIds);

    await Promise.all((notes || []).map((row) => updateNotebookNoteCount(row.notebook_id)));

    res.json({ success: true, deleted: noteIds.length });
  } catch (error) {
    console.error('❌ 批量删除笔记失败:', error);
    res.status(500).json({ success: false, message: error.message || '批量删除笔记失败' });
  }
});

// 移动单个笔记
app.post('/api/note-move', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }

    const { note_id, noteId, target_notebook_id } = req.body || {};
    const sourceNoteId = sanitizeString(note_id || noteId);
    const targetNotebookId = sanitizeString(target_notebook_id);

    if (!sourceNoteId || !targetNotebookId) {
      return res.status(400).json({ success: false, message: '请提供笔记ID和目标笔记本ID' });
    }

    const note = await db.get('SELECT notebook_id FROM notes WHERE note_id = ?', [sourceNoteId]);
    if (!note) {
      return res.status(404).json({ success: false, message: '笔记不存在' });
    }

    const targetNotebook = await getNotebookById(targetNotebookId);
    if (!targetNotebook) {
      return res.status(404).json({ success: false, message: '目标笔记本不存在' });
    }

    const now = new Date().toISOString();
    await db.run(
      'UPDATE notes SET notebook_id = ?, updated_at = ? WHERE note_id = ?',
      [targetNotebookId, now, sourceNoteId]
    );

    await updateNotebookNoteCount(note.notebook_id);
    await updateNotebookNoteCount(targetNotebookId);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ 移动笔记失败:', error);
    res.status(500).json({ success: false, message: error.message || '移动笔记失败' });
  }
});

// 批量移动笔记
app.post('/api/notes-batch-move', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }

    const noteIds = Array.isArray(req.body?.note_ids) ? req.body.note_ids.filter(Boolean) : [];
    const targetNotebookId = sanitizeString(req.body?.target_notebook_id);

    if (noteIds.length === 0 || !targetNotebookId) {
      return res.status(400).json({ success: false, message: '请提供笔记ID列表和目标笔记本ID' });
    }

    const targetNotebook = await getNotebookById(targetNotebookId);
    if (!targetNotebook) {
      return res.status(404).json({ success: false, message: '目标笔记本不存在' });
    }

    const placeholders = noteIds.map(() => '?').join(',');
    const notes = await db.all(
      `SELECT DISTINCT notebook_id FROM notes WHERE note_id IN (${placeholders})`,
      noteIds
    );

    const now = new Date().toISOString();
    await db.run(
      `UPDATE notes SET notebook_id = ?, updated_at = ? WHERE note_id IN (${placeholders})`,
      [targetNotebookId, now, ...noteIds]
    );

    await Promise.all((notes || []).map((row) => updateNotebookNoteCount(row.notebook_id)));
    await updateNotebookNoteCount(targetNotebookId);

    res.json({ success: true, moved: noteIds.length });
  } catch (error) {
    console.error('❌ 批量移动笔记失败:', error);
    res.status(500).json({ success: false, message: error.message || '批量移动笔记失败' });
  }
});

// 创建笔记本
app.post('/api/notebooks', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({
        success: false,
        error: '数据库未连接'
      });
    }

    const { name, description, component_config, componentConfig } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: '请提供有效的笔记本名称'
      });
    }

    const notebookId = `notebook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const desc = typeof description === 'string' ? description.trim() : null;
    const resolvedConfig = resolveNotebookComponentConfig(componentConfig || component_config);

    await db.run(
      `
        INSERT INTO notebooks (notebook_id, name, description, note_count, component_config, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?, ?)
      `,
      [notebookId, name.trim(), desc, resolvedConfig, now, now]
    );

    res.status(201).json({
      success: true,
      notebook: {
        notebook_id: notebookId,
        name: name.trim(),
        description: desc,
        note_count: 0,
        component_config: parseComponentConfigValue(resolvedConfig),
        created_at: now,
        updated_at: now
      }
    });
  } catch (error) {
    console.error('❌ 创建笔记本失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '创建笔记本失败'
    });
  }
});

// 重命名/更新笔记本基础信息
app.post('/api/notebooks/:id/rename', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, message: '数据库未连接' });
    }

    const notebookId = sanitizeString(req.params.id);
    const name = sanitizeString(req.body?.name);
    const descriptionInput = req.body?.description;
    const description =
      descriptionInput === null || descriptionInput === undefined
        ? null
        : sanitizeString(descriptionInput);

    if (!notebookId || !name) {
      return res.status(400).json({ success: false, message: '请提供 notebookId 和新的名称' });
    }

    const existing = await getNotebookById(notebookId);
    if (!existing) {
      return res.status(404).json({ success: false, message: '笔记本不存在' });
    }

    const now = new Date().toISOString();
    await db.run(
      'UPDATE notebooks SET name = ?, description = ?, updated_at = ? WHERE notebook_id = ?',
      [name, description, now, notebookId]
    );

    res.json({
      success: true,
      notebook: {
        ...existing,
        name,
        description,
        updated_at: now
      }
    });
  } catch (error) {
    console.error('❌ 重命名笔记本失败:', error);
    res.status(500).json({ success: false, message: error.message || '重命名笔记本失败' });
  }
});

const deleteNotebookAndRelated = async (notebookId) => {
  const existing = await getNotebookById(notebookId);
  if (!existing) {
    return { notFound: true };
  }

  const notes = await db.all('SELECT note_id FROM notes WHERE notebook_id = ?', [notebookId]);

  await db.run('DELETE FROM notes WHERE notebook_id = ?', [notebookId]);
  await db.run('DELETE FROM notebooks WHERE notebook_id = ?', [notebookId]);
  await db.run('DELETE FROM ai_analysis_setting WHERE notebook_id = ?', [notebookId]);
  await db.run('DELETE FROM analysis_results WHERE notebook_id = ?', [notebookId]);
  await db.run('DELETE FROM notebook_field_templates WHERE notebook_id = ?', [notebookId]);
  await db.run('UPDATE field_template_preferences SET notebook_id = NULL WHERE notebook_id = ?', [
    notebookId
  ]);

  return { deletedNotes: notes?.length || 0 };
};

// 删除笔记本及其相关数据（支持 DELETE）
app.delete('/api/notebooks/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, message: '数据库未连接' });
    }

    const notebookId = sanitizeString(req.params.id);
    if (!notebookId) {
      return res.status(400).json({ success: false, message: '请提供 notebookId' });
    }

    const result = await deleteNotebookAndRelated(notebookId);
    if (result.notFound) {
      return res.status(404).json({ success: false, message: '笔记本不存在' });
    }

    res.json({
      success: true,
      deleted_notes: result.deletedNotes
    });
  } catch (error) {
    console.error('❌ 删除笔记本失败:', error);
    res.status(500).json({ success: false, message: error.message || '删除笔记本失败' });
  }
});

// 删除笔记本兼容 POST（部分代理/客户端不支持 DELETE）
const handleNotebookDelete = async (req, res, notebookId) => {
  if (!db) {
    return res.status(503).json({ success: false, message: '数据库未连接' });
  }

  const result = await deleteNotebookAndRelated(notebookId);
  if (result.notFound) {
    return res.status(404).json({ success: false, message: '笔记本不存在' });
  }

  res.json({
    success: true,
    deleted_notes: result.deletedNotes
  });
};

// 兼容性删除：POST/ALL /api/notebooks/delete
app.all('/api/notebooks/delete', async (req, res) => {
  try {
    const notebookId = sanitizeString(req.body?.notebook_id || req.body?.id);
    if (!notebookId) {
      return res.status(400).json({ success: false, message: '请提供 notebookId' });
    }

    await handleNotebookDelete(req, res, notebookId);
  } catch (error) {
    console.error('❌ 删除笔记本失败:', error);
    res.status(500).json({ success: false, message: error.message || '删除笔记本失败' });
  }
});

// 兼容性删除：POST/ALL /api/notebooks/:id/delete
app.all('/api/notebooks/:id/delete', async (req, res) => {
  try {
    const notebookId = sanitizeString(req.params.id);
    if (!notebookId) {
      return res.status(400).json({ success: false, message: '请提供 notebookId' });
    }
    await handleNotebookDelete(req, res, notebookId);
  } catch (error) {
    console.error('❌ 删除笔记本失败:', error);
    res.status(500).json({ success: false, message: error.message || '删除笔记本失败' });
  }
});

// 获取AI分析配置（图表和AI自定义配置）- 必须在 /api/notebooks/:id 之前注册
app.get('/api/ai-analysis-config/:notebookId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }

    const { notebookId } = req.params;

    if (!notebookId) {
      return res.status(400).json({ success: false, message: 'notebookId is required' });
    }

    // 查询配置
    const setting = await db.get(
      'SELECT * FROM ai_analysis_setting WHERE notebook_id = ?',
      [notebookId]
    );

    if (!setting) {
      return res.json({
        success: true,
        data: null,
        message: '未找到配置'
      });
    }

    // 解析配置数据
    let configData = {};
    try {
      configData = JSON.parse(setting.config_data || '{}');
      console.log(`📖 [ai-analysis-config] 读取配置 (notebookId: ${notebookId}):`, {
        hasChartConfig: !!configData.chart_config,
        chartConfigKeys: configData.chart_config ? Object.keys(configData.chart_config) : [],
        chartConfig: configData.chart_config,
        allConfigKeys: Object.keys(configData)
      });
    } catch (parseError) {
      console.warn(`⚠️ 解析配置数据失败 (notebookId: ${notebookId}):`, parseError.message);
      configData = {};
    }

    res.json({
      success: true,
      data: {
        notebook_id: setting.notebook_id,
        notebook_type: setting.notebook_type,
        config: configData,
        created_at: setting.created_at,
        updated_at: setting.updated_at
      }
    });
  } catch (error) {
    console.error('❌ 获取AI分析配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取配置失败',
      error: error.message
    });
  }
});

// 获取单个笔记本
app.get('/api/notebooks/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, message: '数据库未连接' });
    }

    const notebook = await db.get(
      'SELECT notebook_id, name, description, note_count, component_config, created_at, updated_at FROM notebooks WHERE notebook_id = ?',
      [req.params.id]
    );

    if (!notebook) {
      return res.status(404).json({ success: false, message: '笔记本不存在' });
    }

    const parsedConfig = parseComponentConfigValue(notebook.component_config);

    res.json({
      success: true,
      notebook: {
        ...notebook,
        component_config: parsedConfig
      }
    });
  } catch (error) {
    console.error('❌ 获取笔记本失败:', error);
    res.status(500).json({ success: false, message: error.message || '获取笔记本失败' });
  }
});

// 更新笔记本模板
app.put('/api/notebooks/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, message: '数据库未连接' });
    }

    const { componentConfig, syncToNotes = false } = req.body || {};
    if (!componentConfig || !Array.isArray(componentConfig.componentInstances)) {
      return res.status(400).json({
        success: false,
        message: '请提供有效的 componentConfig'
      });
    }

    const sanitizedInstances = ensureTemplateInstances(componentConfig.componentInstances);
    const normalizedConfig = JSON.stringify({ componentInstances: sanitizedInstances });
    const now = new Date().toISOString();

    await db.run(
      'UPDATE notebooks SET component_config = ?, updated_at = ? WHERE notebook_id = ?',
      [normalizedConfig, now, req.params.id]
    );

    if (syncToNotes) {
      const notes = await db.all(
        'SELECT note_id, component_instances, component_data FROM notes WHERE notebook_id = ?',
        [req.params.id]
      );

      for (const note of notes || []) {
        let existingInstances = [];
        let existingData = {};

        if (note.component_instances) {
          try {
            const parsedInstances = JSON.parse(note.component_instances);
            existingInstances = Array.isArray(parsedInstances) ? parsedInstances : [];
          } catch {
            existingInstances = [];
          }
        }

        if (note.component_data) {
          try {
            const parsedData = JSON.parse(note.component_data);
            existingData = typeof parsedData === 'object' && parsedData ? parsedData : {};
          } catch {
            existingData = {};
          }
        }

        const { idMapping } = mergeComponentInstances(sanitizedInstances, existingInstances);
        const remappedData = {};
        Object.entries(existingData).forEach(([oldId, value]) => {
          const newId = idMapping[oldId];
          if (newId) {
            remappedData[newId] = value;
          }
        });

        await db.run(
          'UPDATE notes SET component_instances = ?, component_data = ?, updated_at = ? WHERE note_id = ?',
          [JSON.stringify(sanitizedInstances), JSON.stringify(remappedData), now, note.note_id]
        );
      }
    }

    res.json({
      success: true,
      message: syncToNotes ? '模板已同步到所有笔记' : '模板已更新',
      component_config: { componentInstances: sanitizedInstances }
    });
  } catch (error) {
    console.error('❌ 更新笔记本模板失败:', error);
    res.status(500).json({ success: false, message: error.message || '更新笔记本模板失败' });
  }
});

app.get('/api/notebooks/:id/field-template', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }
    const notebookId = sanitizeString(req.params.id);
    const sourceType = sanitizeTemplateSource(req.query?.source);
    if (!notebookId) {
      return res.status(400).json({ success: false, error: '请提供 notebook_id' });
    }
    if (!sourceType) {
      return res.status(400).json({ success: false, error: 'source 参数无效，应为 link 或 manual' });
    }
    const notebook = await getNotebookById(notebookId);
    if (!notebook) {
      return res.status(404).json({ success: false, error: '笔记本不存在' });
    }
    const fields = await getFieldTemplateForNotebook(db, notebookId, sourceType);
    res.json({
      success: true,
      data: buildTemplateResponse(notebookId, sourceType, fields)
    });
  } catch (error) {
    console.error('❌ 获取字段模板失败:', error);
    res.status(500).json({ success: false, error: error.message || '获取字段模板失败' });
  }
});

app.put('/api/notebooks/:id/field-template', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }
    const notebookId = sanitizeString(req.params.id);
    const sourceType = sanitizeTemplateSource(req.body?.source);
    const fieldsInput = Array.isArray(req.body?.fields) ? req.body.fields : null;
    if (!notebookId) {
      return res.status(400).json({ success: false, error: '请提供 notebook_id' });
    }
    if (!sourceType) {
      return res.status(400).json({ success: false, error: 'source 参数无效，应为 link 或 manual' });
    }
    const notebook = await getNotebookById(notebookId);
    if (!notebook) {
      return res.status(404).json({ success: false, error: '笔记本不存在' });
    }
    const normalized = await saveFieldTemplateForNotebook(db, notebookId, sourceType, fieldsInput);
    await setLastUsedNotebookForSource(db, sourceType, notebookId);
    res.json({
      success: true,
      data: buildTemplateResponse(notebookId, sourceType, normalized)
    });
  } catch (error) {
    console.error('❌ 保存字段模板失败:', error);
    res.status(500).json({ success: false, error: error.message || '保存字段模板失败' });
  }
});

app.get('/api/field-template/last-used', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }
    const sourceType = sanitizeTemplateSource(req.query?.source);
    if (!sourceType) {
      return res.status(400).json({ success: false, error: 'source 参数无效，应为 link 或 manual' });
    }
    const notebookId = await getLastUsedNotebookForSource(db, sourceType);
    res.json({
      success: true,
      data: { source_type: sourceType, notebook_id: notebookId || null }
    });
  } catch (error) {
    console.error('❌ 获取字段模板最近使用记录失败:', error);
    res.status(500).json({ success: false, error: error.message || '获取最近使用记录失败' });
  }
});

app.put('/api/field-template/last-used', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }
    const sourceType = sanitizeTemplateSource(req.body?.source);
    const notebookId = sanitizeString(req.body?.notebook_id) || null;
    if (!sourceType) {
      return res.status(400).json({ success: false, error: 'source 参数无效，应为 link 或 manual' });
    }
    if (notebookId) {
      const notebook = await getNotebookById(notebookId);
      if (!notebook) {
        return res.status(404).json({ success: false, error: '笔记本不存在' });
      }
    }
    await setLastUsedNotebookForSource(db, sourceType, notebookId);
    res.json({
      success: true,
      data: { source_type: sourceType, notebook_id: notebookId }
    });
  } catch (error) {
    console.error('❌ 设置字段模板最近使用记录失败:', error);
    res.status(500).json({ success: false, error: error.message || '设置最近使用记录失败' });
  }
});

// ==================== AI 字段增量补齐（V2 实验） ====================

app.post('/api/notebooks/:id/ai-fields', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }
    const notebookId = sanitizeString(req.params.id);
    if (!notebookId) {
      return res.status(400).json({ success: false, error: '请提供 notebook_id' });
    }

    const notebook = await getNotebookById(notebookId);
    if (!notebook) {
      return res.status(404).json({ success: false, error: '笔记本不存在' });
    }

    const rawNoteIds = Array.isArray(req.body?.noteIds || req.body?.note_ids)
      ? (req.body.noteIds || req.body.note_ids).map((id) => String(id)).filter(Boolean)
      : [];
    const rawFieldKeys = Array.isArray(req.body?.fieldKeys || req.body?.field_keys)
      ? (req.body.fieldKeys || req.body.field_keys).map((key) => String(key)).filter(Boolean)
      : [];
    const promptTemplateId = sanitizeString(req.body?.promptTemplateId || req.body?.prompt_template_id) || null;

    const fieldKeys =
      rawFieldKeys.length > 0
        ? rawFieldKeys
        : ['mood_score', 'mood_category', 'mood_source', 'mood_keywords'];

    // 目前仅支持情绪相关字段
    const supportedFieldKeys = fieldKeys.filter((key) => AI_MOOD_FIELD_CONFIG[key]);
    if (!supportedFieldKeys.length) {
      return res.json({
        success: true,
        data: { fields: [], values: {} }
      });
    }

    let notes = [];
    if (rawNoteIds.length > 0) {
      const placeholders = rawNoteIds.map(() => '?').join(',');
      notes = await db.all(
        `SELECT ${NOTE_FIELDS} FROM notes WHERE notebook_id = ? AND note_id IN (${placeholders})`,
        [notebookId, ...rawNoteIds]
      );
    } else {
      notes = await db.all(
        `SELECT ${NOTE_FIELDS} FROM notes WHERE notebook_id = ? ORDER BY created_at DESC LIMIT 500`,
        [notebookId]
      );
    }

    if (!notes || notes.length === 0) {
      return res.json({
        success: true,
        data: { fields: [], values: {} }
      });
    }

    const dataset = buildMoodAnalysisDataset(notes);

    const now = new Date().toISOString();
    const fieldDefs = {};

    // 1. 确保字段定义存在
    for (const key of supportedFieldKeys) {
      const config = AI_MOOD_FIELD_CONFIG[key];
      const existingDef = await db.get(
        'SELECT * FROM ai_field_definitions WHERE notebook_id = ? AND field_key = ?',
        [notebookId, key]
      );
      if (existingDef) {
        fieldDefs[key] = existingDef;
      } else {
        const id = generateId('afd');
        await db.run(
          `INSERT INTO ai_field_definitions (
             id, notebook_id, field_key, name, role, data_type, source, prompt_template_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'analysis_v2_ai', ?, ?, ?)`,
          [
            id,
            notebookId,
            key,
            config.name,
            config.role,
            config.dataType,
            promptTemplateId,
            now,
            now
          ]
        );
        fieldDefs[key] = {
          id,
          notebook_id: notebookId,
          field_key: key,
          name: config.name,
          role: config.role,
          data_type: config.dataType,
          source: 'analysis_v2_ai',
          prompt_template_id: promptTemplateId
        };
      }
    }

    // 2. 为缺失的笔记补齐字段值（使用规则推导，后续可替换为真实 AI 调用）
    const valuesMap = {};
    for (const key of supportedFieldKeys) {
      valuesMap[key] = {};
      const fieldDef = fieldDefs[key];
      const existingRows = await db.all(
        'SELECT note_id, value_number, value_text, value_json, status FROM ai_field_values WHERE field_def_id = ?',
        [fieldDef.id]
      );
      const existingByNote = {};
      (existingRows || []).forEach((row) => {
        if (row && row.note_id) {
          existingByNote[row.note_id] = row;
        }
      });

      for (const row of dataset) {
        const noteId = String(row.id);
        const existing = existingByNote[noteId];

        let valueNumber = null;
        let valueText = null;
        let valueJson = null;

        if (key === 'mood_score') {
          valueNumber = row.moodScore;
        } else if (key === 'mood_category') {
          valueText = row.moodCategory;
        } else if (key === 'mood_source') {
          valueText = row.moodSource;
        } else if (key === 'mood_keywords') {
          valueJson = JSON.stringify(row.moodKeywords || []);
        }

        if (!existing) {
          const id = generateId('afv');
          await db.run(
            `INSERT INTO ai_field_values (
               id, note_id, field_def_id, value_number, value_text, value_json, status, model, prompt_template_id, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)`,
            [
              id,
              noteId,
              fieldDef.id,
              valueNumber,
              valueText,
              valueJson,
              null,
              promptTemplateId,
              now,
              now
            ]
          );
        } else if (existing.status !== 'ready') {
          await db.run(
            `UPDATE ai_field_values
               SET value_number = ?, value_text = ?, value_json = ?, status = 'ready', prompt_template_id = ?, updated_at = ?
             WHERE note_id = ? AND field_def_id = ?`,
            [valueNumber, valueText, valueJson, promptTemplateId, now, noteId, fieldDef.id]
          );
        }

        // 填充返回 map（优先使用新值）
        valuesMap[key][noteId] =
          key === 'mood_score'
            ? valueNumber
            : key === 'mood_keywords'
              ? row.moodKeywords || []
              : valueText;
      }
    }

    const fieldsResponse = supportedFieldKeys.map((key) => {
      const def = fieldDefs[key];
      const config = AI_MOOD_FIELD_CONFIG[key];
      return {
        fieldKey: key,
        fieldDefId: def.id,
        notebookId: notebookId,
        name: def.name || config.name,
        role: def.role || config.role,
        dataType: def.data_type || config.dataType,
        source: def.source || 'analysis_v2_ai'
      };
    });

    res.json({
      success: true,
      data: {
        fields: fieldsResponse,
        values: valuesMap
      }
    });
  } catch (error) {
    console.error('❌ 获取/生成 AI 字段失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取 AI 字段失败'
    });
  }
});

// ==================== 分析相关 API ====================

// 获取所有分析结果
app.get('/api/analysis', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }

    const queryStartTime = Date.now();
    
    // 查询分析结果（带超时保护，3秒超时）
    let analyses = [];
    try {
      analyses = await Promise.race([
        db.all(
          'SELECT * FROM analysis_results ORDER BY created_at DESC'
        ),
        new Promise((resolve) => {
          setTimeout(() => {
            console.warn('⚠️ /api/analysis 查询超时（3秒），返回空列表');
            resolve([]);
          }, 3000);
        })
      ]);
    } catch (queryErr) {
      // 检查是否是超时或网络错误
      const isTimeoutError = queryErr?.message?.includes('timeout') || 
                            queryErr?.message?.includes('TIMEOUT') ||
                            queryErr?.message?.includes('fetch failed') ||
                            queryErr?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
                            queryErr?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';
      
      if (isTimeoutError) {
        console.warn('⚠️ /api/analysis Turso 查询超时，返回空列表');
        analyses = [];
      } else {
        console.error('❌ /api/analysis 查询出错:', queryErr?.message || queryErr);
        analyses = [];
      }
    }

    const formattedAnalyses = (analyses || []).map(analysis => {
      let analysisData = {};
      try {
        analysisData = analysis.analysis_data 
          ? JSON.parse(analysis.analysis_data) 
          : {};
      } catch (parseError) {
        console.warn(`⚠️ 无法解析分析数据 (ID: ${analysis.id}):`, parseError.message);
        analysisData = {};
      }

      return {
        id: analysis.id,
        notebookId: analysis.notebook_id,
        notebookType: analysis.notebook_type,
        mode: analysis.mode || 'ai',
        selectedAnalysisComponents: analysisData.selectedAnalysisComponents || [],
        componentConfigs: analysisData.componentConfigs || {},
        analysisData: analysisData,
        metadata: {
          createdAt: analysis.created_at,
          updatedAt: analysis.updated_at,
          dataSource: {
            notebookId: analysis.notebook_id,
            noteIds: analysisData.selectedNotes?.noteIds || [],
            dateRange: analysisData.selectedNotes?.dateRange || null
          }
        }
      };
    });

    const queryTime = Date.now() - queryStartTime;
    if (queryTime > 1000) {
      console.warn(`⚠️ /api/analysis 查询耗时 ${queryTime}ms`);
    }

    res.json({
      success: true,
      data: formattedAnalyses
    });
  } catch (error) {
    console.error('❌ 获取分析结果失败:', error);
    
    // 检查是否是数据库连接超时错误
    const isTimeoutError = error?.message?.includes('timeout') || 
                          error?.message?.includes('TIMEOUT') ||
                          error?.message?.includes('fetch failed') ||
                          error?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
                          error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';
    
    if (isTimeoutError) {
      // 返回空列表而不是 503，让前端能正常显示（只是没有数据）
      return res.json({ 
        success: true, 
        data: [],
        fallback: true,
        message: '数据库查询超时，已返回空列表'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: '获取分析结果失败', 
      error: error.message || '未知错误'
    });
  }
});

// 获取特定分析结果
app.get('/api/analysis/:analysisId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }

    const { analysisId } = req.params;
    
    console.log(`🔍 [GET /api/analysis/:analysisId] 查找分析结果: ${analysisId}`);
    
    const analysis = await db.get(
      'SELECT * FROM analysis_results WHERE id = ?',
      [analysisId]
    );
    
    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: `分析结果不存在: ${analysisId}`
      });
    }
    
    console.log(`✅ [GET /api/analysis/:analysisId] 找到分析结果: ${analysis.id}`);

    // 解析存储的分析数据
    let analysisData;
    try {
      analysisData = JSON.parse(analysis.analysis_data || '{}');
    } catch (parseError) {
      console.warn(`⚠️ 无法解析分析数据，返回空结构: ${analysis.id}`, parseError);
      analysisData = {};
    }
    
    // 构建前端期望的完整数据结构
    const formattedAnalysis = {
      id: analysis.id,
      notebookId: analysis.notebook_id,
      notebookType: analysis.notebook_type,
      mode: analysis.mode || 'ai',
      selectedAnalysisComponents: analysisData.selectedAnalysisComponents || [],
      componentConfigs: analysisData.componentConfigs || {},
      data: analysisData.data || [],
      analysisData: {
        selectedAnalysisComponents: analysisData.selectedAnalysisComponents || [],
        componentConfigs: analysisData.componentConfigs || {},
        processedData: analysisData.processedData || analysisData.data || []
      },
      metadata: {
        createdAt: analysis.created_at,
        updatedAt: analysis.updated_at,
        processingTime: analysisData.processingTime || 0,
        dataSource: {
          notebookId: analysis.notebook_id,
          noteIds: analysisData.selectedNotes?.noteIds || analysisData.metadata?.dataSource?.noteIds || [],
          dateRange: analysisData.selectedNotes?.dateRange || analysisData.metadata?.dataSource?.dateRange || null
        }
      }
    };

    res.json({
      success: true,
      data: formattedAnalysis
    });
  } catch (error) {
    console.error('❌ 获取分析结果失败:', error);
    
    // 检查是否是数据库连接超时错误
    const isTimeoutError = error.message?.includes('timeout') || 
                          error.message?.includes('TIMEOUT') ||
                          error.message?.includes('fetch failed') ||
                          error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
                          error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';
    
    if (isTimeoutError) {
      return res.status(503).json({ 
        success: false, 
        message: '数据库连接超时，请稍后重试', 
        error: '数据库服务暂时不可用，可能是网络问题或服务繁忙。请稍后重试。',
        retryable: true
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: '获取分析结果失败', 
      error: error.message || '未知错误'
    });
  }
});

// 创建/更新分析结果
app.post('/api/analysis', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }

    const { notebookId, notebookType, analysisData, mode = 'ai' } = req.body;
    
    if (!notebookId || !analysisData) {
      return res.status(400).json({ 
        success: false, 
        message: '缺少必要参数：notebookId, analysisData' 
      });
    }

    // 检查是否已存在该笔记本的分析结果（可选：根据 notebookId 查找）
    const existing = await db.all(
      'SELECT * FROM analysis_results WHERE notebook_id = ? ORDER BY created_at DESC LIMIT 1',
      [notebookId]
    );

    let analysisId;
    const now = new Date().toISOString();
    
    if (existing && existing.length > 0) {
      // 如果已存在，更新现有记录
      analysisId = existing[0].id;
      await db.run(
        'UPDATE analysis_results SET analysis_data = ?, mode = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(analysisData), mode, now, analysisId]
      );
      console.log(`✅ 成功更新分析结果: ${analysisId} (笔记本: ${notebookId})`);
    } else {
      // 如果不存在，创建新记录
      analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.run(
        `INSERT INTO analysis_results (id, notebook_id, notebook_type, mode, analysis_data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [analysisId, notebookId, notebookType || 'custom', mode, JSON.stringify(analysisData), now, now]
      );
      console.log(`✅ 成功创建分析结果: ${analysisId} (笔记本: ${notebookId})`);
    }

    res.status(201).json({
      success: true,
      message: existing && existing.length > 0 ? '分析结果更新成功' : '分析结果创建成功',
      data: {
        id: analysisId,
        notebookId,
        notebookType: notebookType || 'custom',
        mode,
        createdAt: now
      }
    });
  } catch (error) {
    console.error('❌ 创建分析结果失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '创建分析结果失败', 
      error: error.message 
    });
  }
});

// 删除分析结果
app.delete('/api/analysis/:analysisId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }

    const { analysisId } = req.params;
    
    const analysis = await db.get(
      'SELECT * FROM analysis_results WHERE id = ?',
      [analysisId]
    );
    
    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: '分析结果不存在'
      });
    }

    await db.run('DELETE FROM analysis_results WHERE id = ?', [analysisId]);

    console.log(`✅ 成功删除分析结果: ${analysisId}`);

    res.json({
      success: true,
      message: '分析结果删除成功'
    });
  } catch (error) {
    console.error('❌ 删除分析结果失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '删除分析结果失败', 
      error: error.message 
    });
  }
});

// 更新笔记组件并可选同步到笔记本模板
app.put('/api/notes/:id/components', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }
    const noteId = sanitizeString(req.params.id);
    if (!noteId) {
      return res.status(400).json({ success: false, message: '请提供笔记ID' });
    }

    const noteRow = await db.get('SELECT notebook_id FROM notes WHERE note_id = ?', [noteId]);
    if (!noteRow) {
      return res.status(404).json({ success: false, message: '笔记不存在' });
    }

    const rawInstances = Array.isArray(req.body?.component_instances)
      ? req.body.component_instances
      : [];
    const rawData =
      req.body?.component_data && typeof req.body.component_data === 'object'
        ? req.body.component_data
        : {};
    const syncToNotebook = !!req.body?.syncToNotebook;

    const sanitizedInstances = rawInstances
      .filter((item) => item && typeof item === 'object')
      .map((inst, index) => {
        const id = sanitizeString(inst.id) || `component_${Date.now()}_${index}`;
        const type = sanitizeString(inst.type) || 'text-short';
        const title = sanitizeString(inst.title) || getComponentTitle(type) || '未命名字段';
        const config = inst.config && typeof inst.config === 'object' ? inst.config : {};
        const dataMapping =
          inst.dataMapping && typeof inst.dataMapping === 'object' ? inst.dataMapping : {};
        return { id, type, title, config, dataMapping };
      });

    const instanceMap = {};
    sanitizedInstances.forEach((inst) => {
      instanceMap[inst.id] = inst;
    });

    const normalizedData = {};
    Object.entries(rawData || {}).forEach(([key, value]) => {
      const id = sanitizeString(key);
      if (!id) return;
      const instance = instanceMap[id];
      const base =
        value && typeof value === 'object' && !Array.isArray(value) ? value : { value };
      normalizedData[id] = {
        title:
          typeof base.title === 'string' && base.title.trim()
            ? base.title.trim()
            : instance?.title || '',
        type: sanitizeString(base.type) || instance?.type || 'text-short',
        value:
          base.value !== undefined && base.value !== null
            ? base.value
            : '',
        ...base
      };
    });

    const now = new Date().toISOString();
    await db.run(
      'UPDATE notes SET component_instances = ?, component_data = ?, updated_at = ? WHERE note_id = ?',
      [JSON.stringify(sanitizedInstances), JSON.stringify(normalizedData), now, noteId]
    );

    if (syncToNotebook) {
      await db.run(
        'UPDATE notebooks SET component_config = ?, updated_at = ? WHERE notebook_id = ?',
        [JSON.stringify({ componentInstances: sanitizedInstances }), now, noteRow.notebook_id]
      );
    }

    res.json({
      success: true,
      data: {
        component_instances: sanitizedInstances,
        component_data: normalizedData,
        synced_notebook: syncToNotebook ? noteRow.notebook_id : null
      }
    });
  } catch (error) {
    console.error('❌ 更新笔记组件失败:', error);
    res.status(500).json({ success: false, message: error.message || '更新笔记组件失败' });
  }
});

// 运行分析并保存结果 (UnifiedAnalysisMode 调用)
app.post('/api/analysis-run', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }

    const { notebookId, noteIds = [], dateRange = {}, fields = {}, chart = {}, prompt } = req.body || {};

    if (!notebookId) {
      return res.status(400).json({ success: false, message: 'notebookId is required' });
    }

    // 获取笔记本信息
    const notebook = await db.get('SELECT * FROM notebooks WHERE notebook_id = ?', [notebookId]);
    if (!notebook) {
      return res.status(404).json({ success: false, message: 'Notebook not found' });
    }

    let notebookComponentInstances = [];
    try {
      const config = typeof notebook.component_config === 'string'
        ? JSON.parse(notebook.component_config)
        : notebook.component_config || {};
      if (config?.componentInstances && Array.isArray(config.componentInstances)) {
        notebookComponentInstances = config.componentInstances;
      }
    } catch (error) {
      console.warn('⚠️ [analysis-run] 无法解析 notebook.component_config:', error.message);
    }

    const titleToId = {};
    const idToTitle = {};
    notebookComponentInstances.forEach((inst) => {
      if (!inst || typeof inst !== 'object') return;
      if (inst.title && inst.id) {
        titleToId[inst.title] = inst.id;
        idToTitle[inst.id] = inst.title;
      }
    });

    const resolveFieldId = (rawId, rawTitle) => {
      if (rawId && String(rawId).trim()) return String(rawId).trim();
      if (rawTitle && titleToId[rawTitle]) return titleToId[rawTitle];
      return rawTitle || rawId || '';
    };

    const normalizeTitle = (fieldId, providedTitle, fallback = '') => {
      if (providedTitle && String(providedTitle).trim()) return String(providedTitle).trim();
      if (fieldId && idToTitle[fieldId]) return idToTitle[fieldId];
      return fallback;
    };

    const rawTooltipIds = Array.isArray(fields.tooltipIds)
      ? fields.tooltipIds
      : (Array.isArray(fields.tooltipTitles) ? fields.tooltipTitles : []);

    const xId = resolveFieldId(fields.xId, fields.xTitle) || 'created_at';
    const yId = resolveFieldId(fields.yId, fields.yTitle) || 'title';
    const pointId = resolveFieldId(fields.pointId, fields.pointTitle);
    const tooltipIds = rawTooltipIds.map((item) => resolveFieldId(item, item)).filter(Boolean);

    const xTitleDisplay = normalizeTitle(xId, fields.xTitle, '日期');
    const yTitleDisplay = normalizeTitle(yId, fields.yTitle, '数值');
    const pointTitleDisplay = normalizeTitle(pointId, fields.pointTitle, '');
    const tooltipTitles = Array.isArray(fields.tooltipTitles)
      ? fields.tooltipTitles.map((title, index) => normalizeTitle(tooltipIds[index], title, ''))
      : tooltipIds.map((id, index) => normalizeTitle(id, rawTooltipIds[index], ''));

    // 构建查询
    let notesQuery = 'SELECT * FROM notes WHERE notebook_id = ?';
    const queryParams = [notebookId];

    if (Array.isArray(noteIds) && noteIds.length > 0) {
      // 直接使用字符串 ID，避免 parseInt 造成丢数据（note_id 是 TEXT 主键）
      const sanitizedIds = noteIds
        .map((id) => (id === null || id === undefined ? '' : String(id).trim()))
        .filter((id) => id.length > 0);
      if (sanitizedIds.length === 0) {
        return res.json({
          success: true,
          data: {
            chart: {
              chartConfigs: [],
              fieldMappings: [],
              processedData: { notes: [], metadata: { noteCount: 0, dateRange: dateRange || {}, notebookId, noteIds: [] } }
            },
            ai: { insights: [] },
            metadata: { noteCount: 0, dateRange: dateRange || {}, notebookId }
          }
        });
      }
      const placeholders = sanitizedIds.map(() => '?').join(',');
      notesQuery += ` AND note_id IN (${placeholders})`;
      queryParams.push(...sanitizedIds);
    } else {
      if (dateRange?.from) {
        notesQuery += ' AND created_at >= ?';
        queryParams.push(dateRange.from);
      }
      if (dateRange?.to) {
        notesQuery += ' AND created_at <= ?';
        queryParams.push(`${dateRange.to}T23:59:59`);
      }
    }

    notesQuery += ' ORDER BY created_at ASC';

    const noteRows = await db.all(notesQuery, queryParams);

    const parsedNotes = noteRows.map((note) => {
      let componentData = {};
      if (note.component_data) {
        try {
          componentData = typeof note.component_data === 'string'
            ? JSON.parse(note.component_data)
            : note.component_data || {};
        } catch {
          componentData = {};
        }
      }
      let componentInstances = [];
      if (note.component_instances) {
        try {
          componentInstances = typeof note.component_instances === 'string'
            ? JSON.parse(note.component_instances)
            : note.component_instances || [];
        } catch {
          componentInstances = [];
        }
      }

      return {
        id: String(note.note_id),
        title: note.title,
        content_text: note.content_text,
        created_at: note.created_at,
        updated_at: note.updated_at || note.created_at,
        component_data: componentData,
        component_instances: componentInstances
      };
    });

    const extractValue = (note, fieldId) => {
      if (!fieldId) return '';
      if (note.component_data && note.component_data[fieldId]) {
        const entry = note.component_data[fieldId];
        if (entry && typeof entry === 'object' && 'value' in entry) {
          return entry.value;
        }
      }
      if (fieldId === 'created_at') return note.created_at || '';
      if (fieldId === 'title') return note.title || '';
      if (fieldId === 'content_text') return note.content_text || '';
      return '';
    };

    const chartData = [];
    parsedNotes.forEach((note) => {
      const xRaw = extractValue(note, xId);
      const yRaw = extractValue(note, yId);
      if (xRaw === '' || yRaw === '') return;

      let xValue = xRaw;
      const date = new Date(xRaw);
      if (!Number.isNaN(date.getTime())) {
        xValue = date.toISOString().slice(0, 10);
      }

      let yValue = yRaw;
      if (typeof yRaw !== 'number') {
        const asNumber = Number(yRaw);
        if (Number.isFinite(asNumber)) {
          yValue = asNumber;
        }
      }

      const tooltip = tooltipIds.map((id, index) => ({
        id,
        label: tooltipTitles[index] || id,
        value: extractValue(note, id)
      }));

      const dataPoint = {
        x: xValue,
        y: yValue,
        id: note.id,
        title: note.title || '',
        tooltip
      };

      if (pointId) {
        const pointValue = extractValue(note, pointId);
        dataPoint.point = pointValue;
        dataPoint[pointId] = pointValue;
      }

      chartData.push(dataPoint);
    });

    const inferDataType = (fieldId, fallback = 'text') => {
      if (!fieldId) return fallback;
      const lower = String(fieldId).toLowerCase();
      if (lower.includes('date') || lower.includes('time') || lower === 'created_at') return 'date';
      if (lower.includes('score') || lower.includes('count') || lower.includes('value') || lower.includes('number')) return 'number';
      return fallback;
    };

    const buildFieldMapping = (fieldId, displayName, role) => {
      if (!fieldId) return null;
      const dataType = inferDataType(fieldId, role === 'x' ? 'date' : 'text');
      const targetField = displayName || idToTitle[fieldId] || fieldId;
      return {
        id: fieldId,
        sourceField: fieldId,
        targetField,
        dataType,
        role,
        status: 'user_confirmed',
        finalConfig: {
          targetField,
          dataType,
          role
        }
      };
    };

    const fieldMappings = [
      buildFieldMapping(xId, xTitleDisplay, 'x'),
      buildFieldMapping(yId, yTitleDisplay, 'y'),
      buildFieldMapping(pointId, pointTitleDisplay, 'point'),
      ...tooltipIds.map((tid, index) =>
        buildFieldMapping(tid, tooltipTitles[index] || tid, 'tooltip')
      )
    ].filter(Boolean);

    const chartType = chart?.chartType || 'line';
    const chartTitle = chart?.title || '智能分析图表';
    const axisDisplay = {
      x: xTitleDisplay ? [xTitleDisplay] : ['X 轴'],
      y: yTitleDisplay ? [yTitleDisplay] : ['Y 轴']
    };

    const fieldAliasMap = {};
    const registerAlias = (key, label) => {
      if (!key || !label) return;
      fieldAliasMap[String(key)] = String(label);
    };
    registerAlias(xId, xTitleDisplay || xId);
    registerAlias('x', xTitleDisplay || xId);
    registerAlias(yId, yTitleDisplay || yId);
    registerAlias('y', yTitleDisplay || yId);
    if (pointId) {
      registerAlias(pointId, pointTitleDisplay || pointId);
      registerAlias('point', pointTitleDisplay || pointId);
      registerAlias('pointField', pointTitleDisplay || pointId);
    }
    tooltipIds.forEach((tid, index) => {
      const label = tooltipTitles[index] || tid;
      registerAlias(tid, label);
      registerAlias(`tooltip${index}`, label);
    });

    const chartConfigs = [
      {
        id: 'chart_0',
        type: chartType,
        config: {
          xField: 'x',
          yField: 'y',
          title: chartTitle,
          pointField: pointId,
          pointDisplay: pointId ? [pointId] : [],
          tooltipFields: tooltipIds,
          axisDisplay,
          fieldAliasMap
        },
        data: chartData,
        rendered: false
      }
    ];

    let insights = [];
    const normalizedNotebookType = (notebook?.type && String(notebook.type).trim()) || 'custom';

    if (prompt && typeof prompt === 'string' && prompt.trim()) {
      try {
        const aiService = new AIService();
        insights = await aiService.generateInsights(normalizedNotebookType, prompt.trim(), parsedNotes);
      } catch (error) {
        console.error('❌ [analysis-run] AI insights error:', error?.message || error);
        insights = [];
      }
    }

    return res.json({
      success: true,
      data: {
        chart: {
          chartConfigs,
          fieldMappings,
          processedData: {
            notes: parsedNotes,
            metadata: {
              noteCount: parsedNotes.length,
              dateRange: dateRange || {},
              notebookType: normalizedNotebookType,
              notebookId,
              noteIds: parsedNotes.map((note) => note.id)
            }
          }
        },
        ai: { insights },
        metadata: {
          noteCount: parsedNotes.length,
          dateRange: dateRange || {},
          notebookId
        }
      }
    });
  } catch (error) {
    console.error('❌ [analysis-run] 分析失败:', error);
    const message = error?.message || '未知错误';
    return res.status(500).json({
      success: false,
      message: `分析失败: ${message}`,
      error: message
    });
  }
});

// 保存AI分析配置（图表和AI自定义配置）
app.post('/api/ai-analysis-config', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接' });
    }

    // 兜底解析：如果 body 为空但原始请求体存在，尝试手动解析
    let requestBody = req.body;
    if ((!requestBody || Object.keys(requestBody).length === 0) && req.rawBody) {
      try {
        requestBody = JSON.parse(req.rawBody);
        console.log('🔄 [ai-analysis-config] 通过 rawBody 兜底解析成功:', {
          keys: Object.keys(requestBody || {})
        });
      } catch (err) {
        console.warn('⚠️ [ai-analysis-config] rawBody 解析失败，继续使用 req.body:', err?.message || err);
      }
    }

    // 首先打印完整的请求体，确认数据是否到达后端
    console.log('📥 [ai-analysis-config] 收到保存请求，完整请求体:', {
      hasBody: !!requestBody,
      bodyKeys: requestBody ? Object.keys(requestBody) : [],
      body: requestBody,
      chart_config: requestBody?.chart_config,
      chartConfig: requestBody?.chartConfig,
      chart_configType: typeof requestBody?.chart_config,
      chart_configIsNull: requestBody?.chart_config === null,
      chart_configIsUndefined: requestBody?.chart_config === undefined
    });

    // 注意：不要给 chart_config 设置默认值 null，因为我们需要区分"请求中没有 chart_config"和"请求中 chart_config 为 null"
    const {
      notebook_id,
      notebook_type = 'custom',
      existing_fields = [],
      ai_recommended_fields = [],
      custom_fields = [],
      all_fields = [],
      custom_prompt = null,
      selected_prompt_id = null,
      selected_prompt_name = null,
      analysis_components = [],
      analysis_params = {}
      // chart_config 单独处理，避免解构导致丢失 undefined/存在性信息
    } = requestBody || {};

    // 直接从 requestBody 读取 chart_config，使用 in 判断字段是否存在，避免 req.body 为空导致丢失
    const hasChartConfigInBody = requestBody && ('chart_config' in requestBody);
    const chart_config = hasChartConfigInBody
      ? requestBody.chart_config
      : (requestBody ? requestBody.chartConfig : undefined);

    console.log('🔍 [ai-analysis-config] 检查请求体中的 chart_config:', {
      hasChartConfigInBody,
      chart_config,
      chart_configType: typeof chart_config,
      chart_configIsUndefined: chart_config === undefined,
      chart_configIsNull: chart_config === null,
      chart_configIsObject: typeof chart_config === 'object' && chart_config !== null,
      reqBodyKeys: req.body ? Object.keys(req.body) : [],
      reqBodyChartConfig: req.body?.chart_config
    });

    // 兼容 chartConfig 命名，并保证为对象或 null；字符串尝试解析
    const normalizedChartConfig = (() => {
      // 优先使用 chart_config，如果没有则尝试 chartConfig（兼容旧命名）
      const raw = chart_config;
      
      console.log('🔍 [ai-analysis-config] 检查 chart_config:', {
        chart_config: chart_config,
        chart_configType: typeof chart_config,
        chart_configIsUndefined: chart_config === undefined,
        chart_configIsNull: chart_config === null,
        chartConfig: req.body?.chartConfig,
        raw: raw,
        rawType: typeof raw,
        rawIsNull: raw === null,
        rawIsUndefined: raw === undefined,
        rawIsObject: typeof raw === 'object' && raw !== null,
        reqBodyKeys: req.body ? Object.keys(req.body) : []
      });
      
      // 如果 raw 是 undefined，说明请求中没有 chart_config
      if (raw === undefined) {
        console.log('💾 [ai-analysis-config] 请求中没有 chart_config（undefined）');
        return undefined; // 返回 undefined 表示请求中没有提供
      }
      
      // 如果 raw 是 null，说明请求中明确设置了 chart_config: null
      if (raw === null) {
        console.log('💾 [ai-analysis-config] 请求中 chart_config 为 null');
        return null;
      }
      
      // 如果是字符串，尝试解析
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          console.log('💾 [ai-analysis-config] chart_config 字符串解析成功:', {
            chartType: parsed.chartType,
            xAxisField: parsed.xAxisField,
            yAxisField: parsed.yAxisField
          });
          return parsed;
        } catch (err) {
          console.warn('⚠️ chart_config 字符串解析失败，忽略:', err?.message || err);
          return null;
        }
      }
      
      // 如果是对象，直接返回
      if (typeof raw === 'object' && raw !== null) {
        console.log('💾 [ai-analysis-config] 找到 chart_config 对象:', {
          chartType: raw.chartType,
          xAxisField: raw.xAxisField,
          yAxisField: raw.yAxisField,
          dataPointField: raw.dataPointField,
          hoverCardFields: raw.hoverCardFields?.length || 0,
          allKeys: Object.keys(raw)
        });
        return raw;
      }
      
      console.warn('⚠️ chart_config 类型异常:', typeof raw);
      return null;
    })();
    console.log('💾 保存AI分析配置请求体:', {
      notebook_id,
      hasChartConfig: normalizedChartConfig ? true : false,
      chartKeys: normalizedChartConfig ? Object.keys(normalizedChartConfig) : [],
      analysis_components,
      chartConfig: normalizedChartConfig
    });

    if (!notebook_id) {
      return res.status(400).json({ success: false, message: 'notebook_id is required' });
    }

    // 检查是否已存在配置，如果存在则合并配置（保留已有字段）
    const existing = await db.get(
      'SELECT * FROM ai_analysis_setting WHERE notebook_id = ?',
      [notebook_id]
    );

    let existingConfigData = {};
    if (existing && existing.config_data) {
      try {
        existingConfigData = typeof existing.config_data === 'string'
          ? JSON.parse(existing.config_data)
          : existing.config_data || {};
      } catch (parseError) {
        console.warn('⚠️ 解析已有配置失败，使用新配置:', parseError.message);
        existingConfigData = {};
      }
    }

    // 构建配置对象（合并已有配置和新配置）
    // 重要：如果请求中提供了 chart_config，即使为 null 也要保存（覆盖已有配置）
    // 如果请求中没有提供 chart_config（undefined），则保留已有配置
    const shouldUpdateChartConfig = normalizedChartConfig !== undefined;
    const finalChartConfig = shouldUpdateChartConfig 
      ? normalizedChartConfig  // 如果提供了（包括 null），使用提供的值
      : (existingConfigData.chart_config || null);  // 如果没有提供，保留已有配置
    
    console.log('🔧 [ai-analysis-config] 决定 chart_config 值:', {
      shouldUpdateChartConfig,
      normalizedChartConfig,
      normalizedChartConfigType: typeof normalizedChartConfig,
      normalizedChartConfigIsUndefined: normalizedChartConfig === undefined,
      normalizedChartConfigIsNull: normalizedChartConfig === null,
      existingChartConfig: existingConfigData.chart_config,
      finalChartConfig: finalChartConfig,
      finalChartConfigType: typeof finalChartConfig,
      finalChartConfigIsUndefined: finalChartConfig === undefined,
      finalChartConfigIsNull: finalChartConfig === null
    });
    
    // 构建 configData，确保 chart_config 字段存在（即使是 null）
    const configData = {
      existing_fields: existing_fields.length > 0 ? existing_fields : (existingConfigData.existing_fields || []),
      ai_recommended_fields: ai_recommended_fields.length > 0 ? ai_recommended_fields : (existingConfigData.ai_recommended_fields || []),
      custom_fields: custom_fields.length > 0 ? custom_fields : (existingConfigData.custom_fields || []),
      all_fields: all_fields.length > 0 ? all_fields : (existingConfigData.all_fields || []),
      custom_prompt: custom_prompt !== null ? custom_prompt : (existingConfigData.custom_prompt || null),
      selected_prompt_id: selected_prompt_id !== null ? selected_prompt_id : (existingConfigData.selected_prompt_id || null),
      selected_prompt_name: selected_prompt_name !== null ? selected_prompt_name : (existingConfigData.selected_prompt_name || null),
      analysis_components: analysis_components.length > 0 ? analysis_components : (existingConfigData.analysis_components || []),
      analysis_params: Object.keys(analysis_params).length > 0 ? analysis_params : (existingConfigData.analysis_params || {}),
      updated_at: new Date().toISOString()
    };
    
    // 明确设置 chart_config，确保它被包含在 configData 中
    // 如果 finalChartConfig 是 undefined，设置为 null（而不是省略字段）
    configData.chart_config = finalChartConfig !== undefined ? finalChartConfig : null;
    
    // 强制验证：确保 chart_config 字段存在
    if (!('chart_config' in configData)) {
      console.error('❌ [ai-analysis-config] 严重错误：chart_config 不在 configData 中！强制添加', {
        finalChartConfig,
        configDataKeys: Object.keys(configData),
        configData: configData
      });
      configData.chart_config = finalChartConfig !== undefined ? finalChartConfig : null;
    }
    
    // 验证 JSON.stringify 后的结果
    const stringifiedConfig = JSON.stringify(configData);
    const parsedConfig = JSON.parse(stringifiedConfig);
    if (!('chart_config' in parsedConfig)) {
      console.error('❌ [ai-analysis-config] 严重错误：JSON.stringify 后 chart_config 丢失！', {
        stringifiedConfig: stringifiedConfig.substring(0, 500),
        parsedConfigKeys: Object.keys(parsedConfig)
      });
    }
    
    console.log('💾 [ai-analysis-config] 准备保存的 configData:', {
      hasChartConfig: !!configData.chart_config,
      chartConfigKeys: configData.chart_config ? Object.keys(configData.chart_config) : [],
      chartConfig: configData.chart_config,
      chartConfigType: typeof configData.chart_config,
      chartConfigIsNull: configData.chart_config === null,
      chartConfigIsUndefined: configData.chart_config === undefined,
      chartConfigInConfigData: 'chart_config' in configData,
      existing_fields: configData.existing_fields.length,
      custom_fields: configData.custom_fields.length,
      all_fields: configData.all_fields.length,
      allConfigKeys: Object.keys(configData),
      stringifiedLength: stringifiedConfig.length,
      stringifiedHasChartConfig: stringifiedConfig.includes('chart_config')
    });

    // 在保存前再次验证 configData 中是否有 chart_config
    const configDataToSave = JSON.parse(JSON.stringify(configData)); // 深拷贝，确保没有 undefined
    if (!('chart_config' in configDataToSave)) {
      console.error('❌ [ai-analysis-config] 保存前验证失败：chart_config 不在 configDataToSave 中！', {
        configDataKeys: Object.keys(configDataToSave),
        configData: configData,
        finalChartConfig
      });
      // 强制添加
      configDataToSave.chart_config = finalChartConfig !== undefined ? finalChartConfig : null;
    }
    
    const configDataString = JSON.stringify(configDataToSave);
    console.log('💾 [ai-analysis-config] 准备保存到数据库:', {
      configDataStringLength: configDataString.length,
      configDataStringPreview: configDataString.substring(0, 500),
      hasChartConfigInString: configDataString.includes('chart_config'),
      configDataToSaveKeys: Object.keys(configDataToSave),
      chartConfigInConfigDataToSave: 'chart_config' in configDataToSave
    });
    
    if (existing) {
      // 更新现有配置
      await db.run(
        'UPDATE ai_analysis_setting SET config_data = ?, updated_at = ? WHERE notebook_id = ?',
        [configDataString, new Date().toISOString(), notebook_id]
      );
      console.log(`✅ 更新AI分析配置: ${notebook_id}`);
      
      // 验证保存结果
      const saved = await db.get('SELECT config_data FROM ai_analysis_setting WHERE notebook_id = ?', [notebook_id]);
      if (saved) {
        const savedConfig = JSON.parse(saved.config_data);
        console.log('✅ [ai-analysis-config] 保存后验证:', {
          hasChartConfig: 'chart_config' in savedConfig,
          chartConfig: savedConfig.chart_config,
          allKeys: Object.keys(savedConfig)
        });
      }
    } else {
      // 创建新配置
      await db.run(
        'INSERT INTO ai_analysis_setting (notebook_id, notebook_type, config_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [notebook_id, notebook_type, configDataString, new Date().toISOString(), new Date().toISOString()]
      );
      console.log(`✅ 创建AI分析配置: ${notebook_id}`);
      
      // 验证保存结果
      const saved = await db.get('SELECT config_data FROM ai_analysis_setting WHERE notebook_id = ?', [notebook_id]);
      if (saved) {
        const savedConfig = JSON.parse(saved.config_data);
        console.log('✅ [ai-analysis-config] 保存后验证:', {
          hasChartConfig: 'chart_config' in savedConfig,
          chartConfig: savedConfig.chart_config,
          allKeys: Object.keys(savedConfig)
        });
      }
    }

    // 验证返回的 config 中是否包含 chart_config
    const responseConfig = { ...configData };
    console.log('📤 [ai-analysis-config] 准备返回响应:', {
      hasChartConfig: !!responseConfig.chart_config,
      chartConfig: responseConfig.chart_config,
      chartConfigType: typeof responseConfig.chart_config,
      allConfigKeys: Object.keys(responseConfig)
    });
    
    res.json({
      success: true,
      message: '配置保存成功',
      data: {
        notebook_id,
        notebook_type,
        config: responseConfig
      }
    });
  } catch (error) {
    console.error('❌ 保存AI分析配置失败:', error);
    res.status(500).json({
      success: false,
      message: '保存配置失败',
      error: error.message
    });
  }
});

// ==================== 分析相关 API 结束 ====================

// 初始化数据库和路由
async function startServer() {
  try {
    console.log('🔄 正在初始化数据库...');
    const { primary, tursoClient: tursoPromise, getTursoClient } = await initDB();
    db = primary;
    console.log('✅ 数据库初始化完成（本地优先，Turso 后台连接）');

    // 检查是否禁用同步（快速禁用方案）
    const syncDisabled = normalizeBoolean(process.env.DISABLE_TURSO_SYNC) || 
                         process.env.TURSO_SYNC_DISABLED === 'true';
    
    // 异步启动同步（不阻塞服务器启动）
    if (!syncDisabled && tursoPromise) {
      // 后台等待 Turso 连接，然后启动同步
      (async () => {
        try {
          // 等待 Turso 连接（最多等待 10 秒）
          console.log('⏳ 等待 Turso 连接（最多 10 秒）...');
          const tursoReady = await Promise.race([
            getTursoClient(),
            new Promise((resolve) => {
              setTimeout(() => {
                console.warn('⚠️ Turso 连接超时（10秒），同步将在连接成功后自动启动');
                resolve(null);
              }, 10000);
            })
          ]);
          
          if (tursoReady) {
            tursoClient = tursoReady;
            
            // 检查是否需要从 Turso 导入数据到本地（仅在本地数据库为空时）
            try {
              console.log('🔍 [turso-import] 检查是否需要从 Turso 导入数据...');
              const importResult = await importFromTurso(db, tursoReady);
              
              if (importResult.imported > 0) {
                console.log(`✅ [turso-import] 成功从 Turso 导入 ${importResult.imported} 条记录到本地数据库`);
              } else if (!importResult.skipped) {
                console.log('ℹ️ [turso-import] 未导入数据:', importResult.reason || importResult.error || '未知原因');
              }
            } catch (importError) {
              console.error('❌ [turso-import] 导入数据失败（不影响服务器启动）:', importError?.message || importError);
              console.log('ℹ️ 将继续使用本地数据库，如果本地为空，请手动导入数据');
            }
            
            // 启动同步服务（本地 → Turso）
            tursoSyncController = startTursoSync({
              localDb: db,
              remoteDb: tursoReady,
              intervalMs: TURSO_SYNC_INTERVAL_MS
            });
            console.log(`🔁 Turso 同步已开启，间隔 ${TURSO_SYNC_INTERVAL_MS}ms`);
          } else {
            console.log('ℹ️ Turso 未连接，同步将在连接成功后自动启动');
          }
        } catch (error) {
          console.error('❌ 启动 Turso 同步失败:', error.message || error);
          console.log('ℹ️ 将继续使用本地 SQLite 数据库');
        }
      })();
    } else {
      if (syncDisabled) {
        console.log('ℹ️ Turso 同步已禁用（DISABLE_TURSO_SYNC=true），运行纯本地模式');
      } else {
        console.log('ℹ️ 未开启 Turso 同步，运行纯本地模式');
      }
    }

    // 注册解析路由
    const parseRouter = initParseRoutes(db);
    app.use('/', parseRouter);

    // 启动服务器
    app.listen(PORT, () => {
      console.log(`[backend] listening on http://localhost:${PORT}`);
      console.log('📝 解析接口已启用:');
      console.log('  - POST /api/coze/parse-article');
      console.log('  - GET /api/coze/parse-history');
      console.log('  - GET /api/coze/parse-history/:id');
      console.log('  - PUT /api/coze/parse-history/:id');
      console.log('  - DELETE /api/coze/parse-history/:id');
      console.log('📊 分析接口已启用:');
      console.log('  - POST /api/analysis');
      console.log('  - GET /api/analysis');
      console.log('  - GET /api/analysis/:id');
      console.log('  - DELETE /api/analysis/:id');
    });
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

// 启动服务器
startServer();
