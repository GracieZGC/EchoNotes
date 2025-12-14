import { sanitizeString } from './string-utils.js';

export const FIELD_TEMPLATE_SOURCES = ['link', 'manual'];

export const FIELD_TEMPLATE_DEFINITIONS = [
  { key: 'title', label: '标题' },
  { key: 'content', label: '正文' },
  { key: 'summary', label: '摘要' },
  { key: 'keywords', label: '关键词' },
  { key: 'img_urls', label: '图片' },
  { key: 'source_url', label: '原文链接' },
  { key: 'author', label: '作者' },
  { key: 'published_at', label: '发布时间' },
  { key: 'source_platform', label: '来源平台' },
  { key: 'note_type', label: '笔记类型' },
  { key: 'link', label: '链路' },
  { key: 'note_created_at', label: '笔记创建时间' }
];

const generateTemplateId = (prefix = 'tpl') =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const getFieldDefinition = (key) =>
  FIELD_TEMPLATE_DEFINITIONS.find((item) => item.key === key) || null;

export const buildDefaultFieldTemplate = () =>
  FIELD_TEMPLATE_DEFINITIONS.map((field, index) => ({
    ...field,
    enabled: true,
    order: index
  }));

export const sanitizeTemplateSource = (value) => {
  const normalized = sanitizeString(value).toLowerCase();
  return FIELD_TEMPLATE_SOURCES.includes(normalized) ? normalized : null;
};

export const normalizeTemplateFields = (fields) => {
  const safeArray = Array.isArray(fields) ? fields : [];
  const map = new Map();
  let orderCursor = 0;
  safeArray.forEach((field) => {
    const key = typeof field?.key === 'string' ? field.key.trim() : '';
    if (!key || map.has(key) || !getFieldDefinition(key)) return;
    map.set(key, {
      key,
      label: sanitizeString(field.label, getFieldDefinition(key)?.label || key),
      enabled: field.enabled !== false,
      order:
        typeof field.order === 'number' && Number.isFinite(field.order)
          ? field.order
          : orderCursor++
    });
  });
  FIELD_TEMPLATE_DEFINITIONS.forEach((definition) => {
    if (!map.has(definition.key)) {
      map.set(definition.key, {
        key: definition.key,
        label: definition.label,
        enabled: false,
        order: orderCursor++
      });
    }
  });
  return Array.from(map.values())
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({
      key: item.key,
      label: item.label,
      enabled: item.enabled !== false,
      order: index
    }));
};

const parseStoredTemplate = (value) => {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.warn('⚠️ 解析字段模板失败，使用默认值:', error?.message || error);
    return null;
  }
};

export const buildTemplateResponse = (notebookId, sourceType, fields) => ({
  notebook_id: notebookId,
  source_type: sourceType,
  fields,
  available_fields: FIELD_TEMPLATE_DEFINITIONS
});

export const getFieldTemplateForNotebook = async (db, notebookId, sourceType) => {
  if (!db || !notebookId || !sourceType) return buildDefaultFieldTemplate();
  const row = await db.get(
    'SELECT fields FROM notebook_field_templates WHERE notebook_id = ? AND source_type = ?',
    [notebookId, sourceType]
  );
  const parsed = parseStoredTemplate(row?.fields);
  return normalizeTemplateFields(parsed);
};

export const saveFieldTemplateForNotebook = async (db, notebookId, sourceType, fields) => {
  if (!db || !notebookId || !sourceType) return buildDefaultFieldTemplate();
  const normalized = normalizeTemplateFields(fields);
  const payload = JSON.stringify(normalized);
  const now = new Date().toISOString();
  const existing = await db.get(
    'SELECT id FROM notebook_field_templates WHERE notebook_id = ? AND source_type = ?',
    [notebookId, sourceType]
  );
  if (existing?.id) {
    await db.run(
      'UPDATE notebook_field_templates SET fields = ?, updated_at = ? WHERE id = ?',
      [payload, now, existing.id]
    );
  } else {
    await db.run(
      'INSERT INTO notebook_field_templates (id, notebook_id, source_type, fields, updated_at) VALUES (?, ?, ?, ?, ?)',
      [generateTemplateId('tpl'), notebookId, sourceType, payload, now]
    );
  }
  return normalized;
};

export const getLastUsedNotebookForSource = async (db, sourceType) => {
  if (!db || !sourceType) return null;
  const row = await db.get('SELECT notebook_id FROM field_template_preferences WHERE source_type = ?', [
    sourceType
  ]);
  return row?.notebook_id || null;
};

export const setLastUsedNotebookForSource = async (db, sourceType, notebookId) => {
  if (!db || !sourceType) return;
  const now = new Date().toISOString();
  const existing = await db.get(
    'SELECT source_type FROM field_template_preferences WHERE source_type = ?',
    [sourceType]
  );
  if (existing?.source_type) {
    await db.run(
      'UPDATE field_template_preferences SET notebook_id = ?, updated_at = ? WHERE source_type = ?',
      [notebookId || null, now, sourceType]
    );
  } else {
    await db.run(
      'INSERT INTO field_template_preferences (source_type, notebook_id, updated_at) VALUES (?, ?, ?)',
      [sourceType, notebookId || null, now]
    );
  }
};

export const filterParsedFieldsByTemplate = (parsedFields = {}, templateFields = []) => {
  if (!parsedFields || typeof parsedFields !== 'object') {
    return {};
  }
  const enabledKeys = new Set(
    (Array.isArray(templateFields) ? templateFields : [])
      .filter((field) => field && field.enabled !== false)
      .map((field) => field.key)
      .filter(Boolean)
  );
  if (!enabledKeys.size) {
    return { ...parsedFields };
  }
  const knownKeys = new Set(FIELD_TEMPLATE_DEFINITIONS.map((item) => item.key));
  const filtered = {};
  Object.entries(parsedFields).forEach(([key, value]) => {
    if (!knownKeys.has(key)) {
      filtered[key] = value;
      return;
    }
    if (enabledKeys.has(key)) {
      filtered[key] = value;
    }
  });
  return filtered;
};

export default {
  FIELD_TEMPLATE_SOURCES,
  FIELD_TEMPLATE_DEFINITIONS,
  buildDefaultFieldTemplate,
  sanitizeTemplateSource,
  normalizeTemplateFields,
  buildTemplateResponse,
  getFieldTemplateForNotebook,
  saveFieldTemplateForNotebook,
  getLastUsedNotebookForSource,
  setLastUsedNotebookForSource,
  filterParsedFieldsByTemplate
};
