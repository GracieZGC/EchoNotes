import express from 'express';
import AIService from '../services/ai-service.js';
import {
  DEFAULT_POLICY_OVERRIDES,
  DEFAULT_FIXED_VOCABULARIES,
  EXEMPLARS_RECOMMEND,
  EXEMPLARS_CONFIG,
  EXEMPLARS_DERIVE_FIELDS,
  selectTopExemplars
} from '../lib/aiChartV3Policy.js';

const stripCodeFences = (text = '') => {
  if (typeof text !== 'string') return '';
  return text.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
};

const safeParseJson = (text) => {
  const cleaned = stripCodeFences(text || '');
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (_) {}
    }
  }
  return null;
};

const clamp01 = (n) => {
  const x = Number(n);
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
};

const inferSceneFromText = (joinedText = '') => {
  const t = (joinedText || '').toLowerCase();
  const containsAny = (arr) => arr.some((w) => t.includes(String(w).toLowerCase()));
  if (containsAny(['记账', '支出', '收入', '¥', '￥', '消费', '报销'])) return 'accounting';
  if (containsAny(['健身', '训练', '跑步', '瑜伽', '游泳', '力量', '运动', '打卡'])) return 'fitness';
  if (containsAny(['心情', '情绪', '焦虑', '开心', '难过', '抑郁', '压力'])) return 'mood';
  if (containsAny(['ai', '模型', 'openai', 'claude', '应用', '工具', '新闻', '发布', '产品', '插件'])) return 'content_collection';
  return 'generic';
};

const buildSlotBlock = (title, payload) => {
  if (!payload) return '';
  return `### ${title}\n${typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}\n`;
};

const buildRecommendPrompt = ({
  fields,
  notes_sample,
  semantic_profile,
  policy_overrides,
  fixed_vocabularies,
  exemplars
}) => {
  const schemaHint = {
    mode: 'recommend',
    core_question: 'string',
    chart_type: 'line|bar|pie|heatmap',
    field_plan: {
      time_field_candidates: [{ name: 'string', score: 0, why: 'string' }],
      dimension_candidates: [{ name: 'string', score: 0, why: 'string' }],
      metric_candidates: [{ name: 'string', score: 0, why: 'string' }],
      selected: { time_field: 'string', dimension: 'string', metric: 'string' },
      aggregation: 'count|sum|avg|none',
      time_granularity: 'day|week|month|none',
      missing_fields: [
        {
          name: 'string',
          role: 'dimension|metric',
          data_type: 'category|number|date',
          meaning: 'string',
          range_or_values: 'string',
          generate_from: ['title', 'content_text', 'field_name'],
          explain_template: 'string(optional)'
        }
      ]
    },
    confidence: 0.0
  };

  return [
    '你是一个内容理解与可视化配置助手。',
    '你只能使用以下四种图表：折线图(line)、柱状图(bar)、饼图(pie)、热力图(heatmap)。不得输出其他图表类型。',
    '当前为【图表推荐模式】：你需要先选择“最值得先看的核心问题”，再推荐一个最佳图表类型，并给出字段计划(field_plan)。',
    '你必须输出严格 JSON，不能输出除 JSON 以外的任何文本。',
    '重要：不得输出 chart_config（映射规则与配置由代码侧生成）。',
    '如果 fixed_vocabularies 中存在某分类字段的枚举列表，则该字段的输出必须从该列表中选择，不得新增类别。',
    '',
    buildSlotBlock('POLICY_OVERRIDES', policy_overrides),
    buildSlotBlock('FIXED_VOCABULARIES', fixed_vocabularies),
    buildSlotBlock('EXEMPLARS_RECOMMEND (learn pattern, do not copy)', exemplars),
    '### INPUT',
    JSON.stringify({ fields, notes_sample, semantic_profile }, null, 2),
    '',
    '### OUTPUT_SCHEMA',
    JSON.stringify(schemaHint, null, 2)
  ].join('\n');
};

const buildRerankPrompt = ({
  chart_type,
  candidate_fields,
  field_stats,
  semantic_profile,
  policy_overrides,
  fixed_vocabularies,
  exemplars
}) => {
  const schemaHint = {
    mode: 'config_rerank',
    chart_type: 'line|bar|pie|heatmap',
    selected_fields: {
      time_field: 'string(optional)',
      dimension_field: 'string(optional)',
      dimension_field_2: 'string(optional)',
      metric_field: 'string(optional)',
      aggregation: 'count|sum|avg|none',
      time_granularity: 'day|week|month|none'
    },
    why: 'string',
    confidence: 0.0
  };

  return [
    '你是一个内容理解与可视化配置助手。',
    '当前为【图表配置字段择优】：用户已指定图表类型，你不得否定或更换图表类型。',
    '你只能从候选字段列表中选择字段，不得发明字段名；不得生成字段值；不得输出 chart_config。',
    '你必须输出严格 JSON，不能输出除 JSON 以外的任何文本。',
    '如果 fixed_vocabularies 中存在某分类字段的枚举列表，则该分类字段必须从该列表中选择。',
    '',
    buildSlotBlock('POLICY_OVERRIDES', policy_overrides),
    buildSlotBlock('FIXED_VOCABULARIES', fixed_vocabularies),
    buildSlotBlock('EXEMPLARS_CONFIG (learn pattern, do not copy)', exemplars),
    '### INPUT',
    JSON.stringify({ chart_type, candidate_fields, field_stats, semantic_profile }, null, 2),
    '',
    '### OUTPUT_SCHEMA',
    JSON.stringify(schemaHint, null, 2)
  ].join('\n');
};

const buildDeriveFieldsPrompt = ({
  missing_fields,
  notes,
  policy_overrides,
  fixed_vocabularies,
  exemplars
}) => {
  const schemaHint = {
    mode: 'derive_fields',
    field_values: {
      字段名: { note_id: 'value' }
    },
    evidence: {
      字段名: { note_id: 'keywords(optional)' }
    }
  };

  return [
    '你是一个字段生成助手。',
    '当前为【字段生成】：你需要根据 missing_fields 定义，为每条 note 生成对应字段的值。',
    '你必须输出严格 JSON，不能输出除 JSON 以外的任何文本。',
    '如果 fixed_vocabularies 中存在该分类字段的枚举列表，你必须从该列表中选择一个值，不得新增类别。',
    '数值字段必须在 missing_fields 指定范围内（若提供）。无法判断时输出 null 或 “其他”（分类）。',
    '',
    buildSlotBlock('POLICY_OVERRIDES', policy_overrides),
    buildSlotBlock('FIXED_VOCABULARIES', fixed_vocabularies),
    buildSlotBlock('EXEMPLARS_DERIVE_FIELDS (learn pattern, do not copy)', exemplars),
    '### INPUT',
    JSON.stringify({ missing_fields, notes }, null, 2),
    '',
    '### OUTPUT_SCHEMA',
    JSON.stringify(schemaHint, null, 2)
  ].join('\n');
};

const rulePickFirstByPreference = (candidates = [], preferences = []) => {
  const list = (candidates || []).filter(Boolean);
  if (!list.length) return '';
  for (const pref of preferences || []) {
    const hit = list.find((name) => String(name).includes(String(pref)));
    if (hit) return hit;
  }
  return list[0];
};

const heuristicRecommend = ({ fields = [], notes_sample = [], semantic_profile = {}, policy_overrides = {} }) => {
  const fieldNames = (fields || []).map((f) => f?.name).filter(Boolean);
  const text = [
    ...(fieldNames || []),
    ...((notes_sample || []).map((n) => `${n?.title || ''} ${n?.excerpt || ''}`))
  ].join(' ');
  const scene = inferSceneFromText(text);

  const pref = policy_overrides?.field_name_preferences || DEFAULT_POLICY_OVERRIDES.field_name_preferences;
  const timeField = rulePickFirstByPreference(fieldNames.filter((n) => /时间|日期|created_at|updated_at|发布/.test(n)), pref.time);

  if (scene === 'content_collection') {
    return {
      mode: 'recommend',
      core_question: '我收集的内容主要关注哪些主题？',
      chart_type: 'pie',
      field_plan: {
        time_field_candidates: timeField ? [{ name: timeField, score: 0.6, why: '可用于趋势/时间过滤' }] : [],
        dimension_candidates: [{ name: '主题(生成)', score: 0.9, why: '用于统计关注点构成' }],
        metric_candidates: [{ name: 'count', score: 0.9, why: '按主题计数' }],
        selected: { time_field: timeField || '', dimension: '主题(生成)', metric: 'count' },
        aggregation: 'count',
        time_granularity: 'none',
        missing_fields: [
          {
            name: '主题',
            role: 'dimension',
            data_type: 'category',
            meaning: '文章主题分类',
            range_or_values: '见 fixed_vocabularies 或 其他',
            generate_from: ['title', 'content_text'],
            explain_template: '根据标题与正文关键词判断主题分类'
          }
        ]
      },
      confidence: 0.55
    };
  }

  if (scene === 'accounting') {
    return {
      mode: 'recommend',
      core_question: '我的支出主要花在什么类别？',
      chart_type: 'pie',
      field_plan: {
        time_field_candidates: timeField ? [{ name: timeField, score: 0.6, why: '可按月查看趋势' }] : [],
        dimension_candidates: [{ name: '记账类型(生成)', score: 0.9, why: '用于支出构成' }],
        metric_candidates: [{ name: '金额(生成)', score: 0.8, why: '统计金额总和' }, { name: 'count', score: 0.5, why: '备选：统计条目数' }],
        selected: { time_field: timeField || '', dimension: '记账类型(生成)', metric: '金额(生成)' },
        aggregation: 'sum',
        time_granularity: 'month',
        missing_fields: [
          {
            name: '记账类型',
            role: 'dimension',
            data_type: 'category',
            meaning: '支出/收入分类',
            range_or_values: '见 fixed_vocabularies',
            generate_from: ['title', 'content_text'],
            explain_template: '根据文本里的消费场景/商品判断类别'
          },
          {
            name: '金额',
            role: 'metric',
            data_type: 'number',
            meaning: '金额数值',
            range_or_values: '>=0',
            generate_from: ['title', 'content_text'],
            explain_template: '从文本中提取金额（¥/￥/数字）'
          }
        ]
      },
      confidence: 0.55
    };
  }

  // 默认趋势：频次
  return {
    mode: 'recommend',
    core_question: '最近记录/收集的频率如何变化？',
    chart_type: 'line',
    field_plan: {
      time_field_candidates: timeField ? [{ name: timeField, score: 0.8, why: '用于时间趋势' }] : [],
      dimension_candidates: timeField ? [{ name: timeField, score: 0.8, why: '时间轴' }] : [],
      metric_candidates: [{ name: 'count', score: 0.9, why: '按时间聚合计数' }],
      selected: { time_field: timeField || '', dimension: timeField || '', metric: 'count' },
      aggregation: 'count',
      time_granularity: 'day',
      missing_fields: []
    },
    confidence: 0.45
  };
};

export const initAIChartV3Routes = (options = {}) => {
  const router = express.Router();
  const aiService = options.aiService instanceof AIService ? options.aiService : new AIService();

  router.post('/api/ai-chart/recommend', async (req, res) => {
    try {
      const fields = Array.isArray(req.body?.fields) ? req.body.fields : [];
      const notes_sample = Array.isArray(req.body?.notes_sample) ? req.body.notes_sample : [];
      const semantic_profile = req.body?.semantic_profile && typeof req.body.semantic_profile === 'object'
        ? req.body.semantic_profile
        : {};

      const policy_overrides =
        req.body?.policy_overrides && typeof req.body.policy_overrides === 'object'
          ? req.body.policy_overrides
          : DEFAULT_POLICY_OVERRIDES;
      const fixed_vocabularies =
        req.body?.fixed_vocabularies && typeof req.body.fixed_vocabularies === 'object'
          ? req.body.fixed_vocabularies
          : (policy_overrides?.fixed_vocabularies || DEFAULT_FIXED_VOCABULARIES);

      const profileForPick = {
        keywords: Array.isArray(semantic_profile?.keywords) ? semantic_profile.keywords : [],
        field_names: fields.map((f) => f?.name).filter(Boolean)
      };
      const exemplars = selectTopExemplars(EXEMPLARS_RECOMMEND, profileForPick, { limit: 3 });

      const prompt = buildRecommendPrompt({
        fields,
        notes_sample,
        semantic_profile,
        policy_overrides,
        fixed_vocabularies,
        exemplars
      });

      const raw = await aiService.generateText('ai-chart-recommend', {
        messages: [
          { role: 'system', content: '你必须只输出 JSON。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        maxTokens: 2000
      });

      const parsed = safeParseJson(raw);
      if (!parsed || typeof parsed !== 'object') {
        return res.json({ success: true, data: heuristicRecommend({ fields, notes_sample, semantic_profile, policy_overrides }), meta: { source: 'heuristic', parse_failed: true } });
      }

      // 最小清洗
      const chartType = ['line', 'bar', 'pie', 'heatmap'].includes(parsed.chart_type) ? parsed.chart_type : null;
      const normalized = {
        ...parsed,
        mode: 'recommend',
        chart_type: chartType || 'bar',
        confidence: clamp01(parsed.confidence)
      };

      return res.json({ success: true, data: normalized, meta: { source: 'llm' } });
    } catch (error) {
      console.error('❌ /api/ai-chart/recommend failed:', error);
      return res.status(500).json({ success: false, error: error?.message || 'recommend failed' });
    }
  });

  router.post('/api/ai-chart/rerank', async (req, res) => {
    try {
      const chart_type = String(req.body?.chart_type || '');
      if (!['line', 'bar', 'pie', 'heatmap'].includes(chart_type)) {
        return res.status(400).json({ success: false, error: 'chart_type invalid' });
      }
      const candidate_fields = req.body?.candidate_fields && typeof req.body.candidate_fields === 'object'
        ? req.body.candidate_fields
        : {};
      const field_stats = req.body?.field_stats && typeof req.body.field_stats === 'object'
        ? req.body.field_stats
        : {};
      const semantic_profile = req.body?.semantic_profile && typeof req.body.semantic_profile === 'object'
        ? req.body.semantic_profile
        : {};

      const policy_overrides =
        req.body?.policy_overrides && typeof req.body.policy_overrides === 'object'
          ? req.body.policy_overrides
          : DEFAULT_POLICY_OVERRIDES;
      const fixed_vocabularies =
        req.body?.fixed_vocabularies && typeof req.body.fixed_vocabularies === 'object'
          ? req.body.fixed_vocabularies
          : (policy_overrides?.fixed_vocabularies || DEFAULT_FIXED_VOCABULARIES);

      const profileForPick = {
        keywords: Array.isArray(semantic_profile?.keywords) ? semantic_profile.keywords : [],
        field_names: []
      };
      const exemplars = selectTopExemplars(EXEMPLARS_CONFIG, profileForPick, { chartType: chart_type, limit: 2 });

      const prompt = buildRerankPrompt({
        chart_type,
        candidate_fields,
        field_stats,
        semantic_profile,
        policy_overrides,
        fixed_vocabularies,
        exemplars
      });

      const raw = await aiService.generateText('ai-chart-rerank', {
        messages: [
          { role: 'system', content: '你必须只输出 JSON。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        maxTokens: 1200
      });

      const parsed = safeParseJson(raw);
      if (!parsed || typeof parsed !== 'object') {
        const prefs = policy_overrides?.field_name_preferences || DEFAULT_POLICY_OVERRIDES.field_name_preferences;
        const selected = {
          time_field: rulePickFirstByPreference(candidate_fields?.time || [], prefs.time),
          dimension_field: rulePickFirstByPreference(candidate_fields?.dimension || [], prefs.topic),
          dimension_field_2: (candidate_fields?.dimension2 || [])[0] || '',
          metric_field: rulePickFirstByPreference(candidate_fields?.metric || [], prefs.amount),
          aggregation: candidate_fields?.aggregation || 'count',
          time_granularity: candidate_fields?.time_granularity || 'none'
        };
        return res.json({ success: true, data: { mode: 'config_rerank', chart_type, selected_fields: selected, why: '规则偏好兜底选择', confidence: 0.2 }, meta: { source: 'heuristic', parse_failed: true } });
      }

      const normalized = {
        ...parsed,
        mode: 'config_rerank',
        chart_type,
        confidence: clamp01(parsed.confidence)
      };
      return res.json({ success: true, data: normalized, meta: { source: 'llm' } });
    } catch (error) {
      console.error('❌ /api/ai-chart/rerank failed:', error);
      return res.status(500).json({ success: false, error: error?.message || 'rerank failed' });
    }
  });

  router.post('/api/ai-chart/derive-fields', async (req, res) => {
    try {
      const missing_fields = Array.isArray(req.body?.missing_fields) ? req.body.missing_fields : [];
      const notes = Array.isArray(req.body?.notes) ? req.body.notes : [];
      if (!missing_fields.length) {
        return res.json({ success: true, data: { mode: 'derive_fields', field_values: {}, evidence: {} }, meta: { source: 'noop' } });
      }

      const policy_overrides =
        req.body?.policy_overrides && typeof req.body.policy_overrides === 'object'
          ? req.body.policy_overrides
          : DEFAULT_POLICY_OVERRIDES;
      const fixed_vocabularies =
        req.body?.fixed_vocabularies && typeof req.body.fixed_vocabularies === 'object'
          ? req.body.fixed_vocabularies
          : (policy_overrides?.fixed_vocabularies || DEFAULT_FIXED_VOCABULARIES);

      const exemplars = selectTopExemplars(EXEMPLARS_DERIVE_FIELDS, { keywords: [], field_names: [] }, { limit: 1 });

      const prompt = buildDeriveFieldsPrompt({
        missing_fields,
        notes,
        policy_overrides,
        fixed_vocabularies,
        exemplars
      });

      const raw = await aiService.generateText('ai-chart-derive-fields', {
        messages: [
          { role: 'system', content: '你必须只输出 JSON。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        maxTokens: 2500
      });

      const parsed = safeParseJson(raw);
      if (!parsed || typeof parsed !== 'object') {
        // 极简兜底：分类字段 => 其他；数值字段 => 1
        const field_values = {};
        missing_fields.forEach((f) => {
          const name = String(f?.name || '').trim();
          if (!name) return;
          field_values[name] = {};
          notes.forEach((n) => {
            const id = String(n?.id || n?.note_id || '').trim();
            if (!id) return;
            if (f?.data_type === 'category') {
              const vocab = fixed_vocabularies?.[name] || ['其他'];
              field_values[name][id] = vocab.includes('其他') ? '其他' : vocab[0];
            } else if (f?.data_type === 'number') {
              field_values[name][id] = 1;
            } else {
              field_values[name][id] = null;
            }
          });
        });
        return res.json({ success: true, data: { mode: 'derive_fields', field_values, evidence: {} }, meta: { source: 'heuristic', parse_failed: true } });
      }

      const normalized = {
        ...parsed,
        mode: 'derive_fields'
      };
      return res.json({ success: true, data: normalized, meta: { source: 'llm' } });
    } catch (error) {
      console.error('❌ /api/ai-chart/derive-fields failed:', error);
      return res.status(500).json({ success: false, error: error?.message || 'derive-fields failed' });
    }
  });

  return router;
};

