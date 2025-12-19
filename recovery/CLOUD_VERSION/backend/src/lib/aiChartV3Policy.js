/**
 * AI 图表分析 V3：默认策略与 few-shot 样本插槽
 *
 * 说明：
 * - POLICY_OVERRIDES 用于工程强控制（优先级最高）
 * - EXEMPLARS_* 用于 few-shot（按语义画像相似度取 topK 注入）
 * - FIXED_VOCABULARIES 可作为分类字段的固定枚举约束
 */

export const DEFAULT_POLICY_OVERRIDES = {
  field_name_preferences: {
    time: ['发布时间', '日期', 'created_at', '笔记创建时间', '时间'],
    topic: ['主题', '标签', '关键词'],
    amount: ['金额', '支出', '收入']
  },
  gates: {
    pie_topn: 8,
    line_min_points: 5,
    heatmap_min_density: 0.1,
    field_max_missing_rate: 0.4,
    bar_max_categories: 30
  }
};

export const DEFAULT_FIXED_VOCABULARIES = {
  主题: ['模型', '工具', '应用', '行业', '研究', '其他'],
  情绪来源: ['工作', '家庭', '朋友', '健康', '金钱', '自我成长', '其他'],
  记账类型: ['餐饮', '交通', '住房', '购物', '娱乐', '医疗', '教育', '其他']
};

export const EXEMPLARS_RECOMMEND = [
  {
    name: 'ai_news_topic_distribution',
    when: {
      keywords: ['AI', '模型', '应用', '工具', '新闻', '发布', 'OpenAI', 'Claude'],
      field_signals: ['标题', '内容', '来源', 'created_at', '发布时间', '关键词']
    },
    input_example: {
      fields: ['标题', '内容', '来源平台', '笔记创建时间', '关键词'],
      notes_sample: [
        { title: 'OpenAI 发布新功能...', excerpt: 'AI 应用/工具/插件...', created_at: '2025-12-01' },
        { title: '某公司推出AI助手', excerpt: '应用场景...', created_at: '2025-12-02' }
      ]
    },
    output_example: {
      core_question: '我收集的 AI 内容主要集中在哪些主题？',
      chart_type: 'pie',
      field_plan: {
        selected: { dimension: '主题(生成)', metric: 'count' },
        missing_fields: [
          {
            name: '主题',
            role: 'dimension',
            data_type: 'category',
            values: ['模型', '工具', '应用', '行业', '研究', '其他'],
            generate_from: ['title', 'content_text']
          }
        ],
        aggregation: 'count',
        time_granularity: 'none'
      }
    }
  }
];

export const EXEMPLARS_CONFIG = [
  {
    name: 'mood_line_trend',
    when: { chart_type: 'line', keywords: ['心情', '情绪'] },
    input_example: {
      chart_type: 'line',
      candidate_fields: {
        time: ['日期(生成)', '笔记创建时间', '发布时间'],
        metric: ['情绪分数(生成)', 'count']
      }
    },
    output_example: {
      selected_fields: {
        time_field: '日期(生成)',
        metric_field: '情绪分数(生成)',
        aggregation: 'avg',
        time_granularity: 'day'
      },
      why: '用日期对齐时间序列，用情绪分数量化强度，表达情绪随时间变化。'
    }
  }
];

export const EXEMPLARS_DERIVE_FIELDS = [
  {
    name: 'derive_topic_fixed_vocab',
    when: { field_name: '主题', data_type: 'category' },
    definition_example: {
      name: '主题',
      values: ['模型', '工具', '应用', '行业', '研究', '其他'],
      generate_from: ['title', 'content_text']
    },
    io_example: {
      note: { id: 'n1', title: 'AI 插件推荐', excerpt: '提升效率的工具...' },
      output: { 主题: '工具', evidence: '工具/插件/效率' }
    }
  }
];

export const scoreExemplar = (exemplar, profile = {}, chartType = null) => {
  const keywords = Array.isArray(profile?.keywords) ? profile.keywords : [];
  const fields = Array.isArray(profile?.field_names) ? profile.field_names : [];
  const when = exemplar?.when || {};
  let score = 0;

  if (chartType && when.chart_type && when.chart_type === chartType) score += 3;

  const whenKeywords = Array.isArray(when.keywords) ? when.keywords : [];
  whenKeywords.forEach((kw) => {
    if (!kw) return;
    const hit = keywords.some((k) => String(k).toLowerCase().includes(String(kw).toLowerCase())) ||
      fields.some((f) => String(f).toLowerCase().includes(String(kw).toLowerCase()));
    if (hit) score += 1;
  });

  const whenSignals = Array.isArray(when.field_signals) ? when.field_signals : [];
  whenSignals.forEach((sig) => {
    if (!sig) return;
    const hit = fields.some((f) => String(f).includes(String(sig)));
    if (hit) score += 1;
  });

  return score;
};

export const selectTopExemplars = (pool = [], profile = {}, { chartType = null, limit = 3 } = {}) => {
  const ranked = [...(pool || [])]
    .map((ex) => ({ ex, score: scoreExemplar(ex, profile, chartType) }))
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .slice(0, Math.max(0, limit));
  return ranked.map((item) => item.ex);
};

