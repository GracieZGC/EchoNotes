import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  rectIntersection,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import apiClient, { type Notebook, type Note } from '../apiClient';
import type { ComponentInstance } from '../utils/componentSync';
import { createComponentInstance, parseComponentConfig as parseNotebookComponentConfig, type ComponentType } from '../constants/notebookComponents';

type FieldRole = 'dimension' | 'metric';
type AxisSlot = 'dimension' | 'dimension2' | 'metric';
type FieldSource = 'notebook' | 'system' | 'ai-temp' | 'custom';
type FieldDataType = 'date' | 'number' | 'text' | 'category';

interface FieldDefinition {
  id: string;
  name: string;
  role: FieldRole;
  dataType: FieldDataType;
  source: FieldSource;
  description?: string;
  sampleValue?: string;
}

interface AnalysisDatum {
  id: string;
  日期: string;
  日期原始: Date;
  情绪分数: number;
  情绪类别: string;
  情绪来源: string;
  情绪关键词: string[];
  文本内容: string;
  标题?: string;
  摘要?: string;
  [key: string]: any;
}

type ChartType = 'line' | 'bar' | 'pie' | 'area' | 'heatmap' | 'wordcloud';

interface ChartCandidate {
  id: string;
  title: string;
  chartType: ChartType;
  icon: React.ReactNode;
  reason: string;
  requiredDimensions: string[];
  requiredMetrics: string[];
  optionalFields?: string[];
}

interface ChartInstance {
  id: string;
  candidateId: string;
  title: string;
  chartType: ChartType;
  reason?: string;
  dimensionCandidates: string[];
  dimension2Candidates?: string[];
  metricCandidates: string[];
  selectedDimension: string | null;
  selectedDimension2?: string | null;
  selectedMetric: string | null;
  filters: string[];
  createdAt: number;
}

interface SavedChartConfigResult {
  candidates: ChartCandidate[];
  instances: ChartInstance[];
  activeChartId: string | null;
}

type AnalysisStage =
  | 'idle'
  | 'loading'
  | 'recommending'
  | 'deriving_fields'
  | 'reranking'
  | 'ready'
  | 'error';

const AXIS_DROP_TARGET_IDS = {
  dimension: 'axis-drop-dimension',
  dimension2: 'axis-drop-dimension2',
  metric: 'axis-drop-metric'
} as const;

const LineChartIcon = (
  <svg viewBox="0 0 1024 1024" className="w-6 h-6" aria-hidden="true" focusable="false">
    <path d="M896 896H96a32 32 0 0 1-32-32V224a32 32 0 0 1 64 0v608h768a32 32 0 1 1 0 64z" fill="#2c2c2c"></path>
    <path d="M247.008 640a32 32 0 0 1-20.992-56.192l200.992-174.24a32 32 0 0 1 42.272 0.288l172.128 153.44 229.088-246.304a32 32 0 0 1 46.88 43.616l-250.432 269.216a31.936 31.936 0 0 1-44.704 2.08l-174.56-155.52-179.744 155.84a31.872 31.872 0 0 1-20.928 7.776z" fill="#2c2c2c"></path>
  </svg>
);

const BarChartIcon = (
  <svg viewBox="0 0 1024 1024" className="w-6 h-6" aria-hidden="true" focusable="false">
    <path d="M896 896H96a32 32 0 0 1-32-32V224a32 32 0 0 1 64 0v608h768a32 32 0 1 1 0 64z" fill="#2c2c2c"></path>
    <path d="M512 752.16a32 32 0 0 1-32-32V350.624a32 32 0 0 1 64 0v369.536a32 32 0 0 1-32 32zM320 752.576a32 32 0 0 1-32-32V512a32 32 0 0 1 64 0v208.576a32 32 0 0 1-32 32zM896 752.672a32 32 0 0 1-32-32V163.488a32 32 0 1 1 64 0v557.184a32 32 0 0 1-32 32zM704 752.736a32 32 0 0 1-32-32V224a32 32 0 1 1 64 0v496.736a32 32 0 0 1-32 32z" fill="#2c2c2c"></path>
  </svg>
);

const PieChartIcon = (
  <svg viewBox="0 0 1024 1024" className="w-6 h-6" aria-hidden="true" focusable="false">
    <path d="M896 480c-1.344 0-2.464 0.608-3.744 0.768-1.28-0.16-2.432-0.768-3.744-0.768H544V132c0-0.704-0.352-1.312-0.416-2.016 0.064-0.672 0.416-1.28 0.416-1.984a32 32 0 0 0-32-32C282.624 96 96 282.624 96 512s186.624 416 416 416 416-186.624 416-416a32 32 0 0 0-32-32zM512 864C317.92 864 160 706.08 160 512 160 328.704 300.864 177.856 480 161.632V512a32 32 0 0 0 32 32h350.368C846.144 723.136 695.296 864 512 864zM625.664 178.72a355.36 355.36 0 0 1 216.832 211.84 32 32 0 1 0 60.064-22.048 414.24 414.24 0 0 0-256.224-250.336 31.968 31.968 0 1 0-20.672 60.544z"></path>
  </svg>
);

const HeatmapIcon = (
  <svg viewBox="0 0 1024 1024" className="w-6 h-6" aria-hidden="true" focusable="false">
    <path d="M0.933123 0h62.753757v961.954817H0.933123z" fill="#515151"></path>
    <path d="M0.853283 958.861041h1022.293434v65.138959H0.853283z" fill="#515151"></path>
    <path d="M386.697074 800.609399h124.399743v158.51112H386.697074z" fill="#707070"></path>
    <path d="M510.488042 800.329961h124.399742v158.51112H510.488042z" fill="#515151"></path>
    <path d="M263.953999 642.736994h124.399742v158.51112H263.953999z" fill="#707070"></path>
    <path d="M387.744966 642.457556h124.399743v158.51112H387.744966z" fill="#515151"></path>
    <path d="M634.19917 800.878857h124.399742v158.51112H634.19917z" fill="#707070"></path>
    <path d="M757.990137 800.599419h124.399743v158.51112H757.990137z" fill="#515151"></path>
    <path d="M511.456094 642.00846h124.399743v158.51112H511.456094z" fill="#707070"></path>
    <path d="M635.247062 642.727014h124.399742v158.51112H635.247062zM139.504356 642.277917h124.399743V800.789038H139.504356zM63.65694 318.958346h124.399743v158.51112H63.65694z" fill="#515151"></path>
    <path d="M386.148178 483.4674h124.399743v158.51112H386.148178z" fill="#707070"></path>
    <path d="M509.929166 483.187962h124.399743v158.51112H509.929166z" fill="#515151"></path>
    <path d="M757.401322 485.273766h124.399742v158.51112H757.401322zM760.23562 166.30544h124.399742v158.51112H760.23562zM386.058359 166.854336h124.399743v158.51112H386.058359zM510.917178 325.115958h124.399743V483.627078H510.917178z" fill="#707070"></path>
    <path d="M386.188098 325.305577h124.399743v158.51112H386.188098zM634.688186 166.495059h124.399743v158.51112H634.688186zM261.488958 484.265793h124.399742v158.511121H261.488958z" fill="#515151"></path>
    <path d="M63.327603 160.437245h124.399742v158.511121H63.327603z" fill="#707070"></path>
  </svg>
);

const WordcloudIcon = (
  <svg viewBox="0 0 1024 1024" className="w-6 h-6" aria-hidden="true" focusable="false">
    <path d="M282 260H412v100H282V260zM112 410h250V460H112v-50z m300 0h300V560h-300v-150z m-100 200h250v100H312v-100z m150-300h340V360h-340V310z m300 100h100v100h-100v-100z m-600 100h200V560h-200v-50z m450 100h100v100h-100v-100z m150-50H912v250h-150V560zM112 760h600v100H112v-100z m350-600h400v100h-400V160z"></path>
  </svg>
);

const AreaChartIcon = LineChartIcon;

const componentRoleMap: Record<string, { role: FieldRole; dataType: FieldDataType }> = {
  date: { role: 'dimension', dataType: 'date' },
  number: { role: 'metric', dataType: 'number' },
  'text-short': { role: 'dimension', dataType: 'text' },
  'text-long': { role: 'dimension', dataType: 'text' },
  'ai-custom': { role: 'dimension', dataType: 'text' },
  image: { role: 'dimension', dataType: 'text' },
  chart: { role: 'metric', dataType: 'number' }
};

const moodSourcePresets = [
  { label: '工作', keywords: ['工作', '项目', '加班', '老板', '同事', '任务'] },
  { label: '朋友', keywords: ['朋友', '同学', '聚会', '社交', '聊天'] },
  { label: '家人', keywords: ['家人', '父母', '孩子', '家庭'] },
  { label: '健康', keywords: ['健康', '身体', '锻炼', '运动', '生病'] },
  { label: '成长', keywords: ['学习', '成长', '自我', '阅读'] }
];

const COLORS = ['#6E56CF', '#3E63DD', '#12A594', '#F76808', '#D6409F', '#F5A524', '#9DA3AE'];
const AXIS_PADDING = { left: 24, right: 24 };
const CHART_TYPE_LABELS: Record<ChartType, string> = {
  line: '折线图',
  bar: '柱状图',
  pie: '饼图',
  area: '面积图',
  heatmap: '热力图',
  wordcloud: '词云'
};

const MIN_COLUMN_PERCENT = 20;

// AI 图表分析 V3：policy_overrides + fixed_vocabularies（工程口子，后续可外置为配置/后端下发）
const AI_CHART_POLICY_OVERRIDES = {
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
} as const;

const AI_CHART_FIXED_VOCABULARIES = {
  主题: ['模型', '工具', '应用', '行业', '研究', '其他'],
  情绪来源: ['工作', '家庭', '朋友', '健康', '金钱', '自我成长', '其他'],
  记账类型: ['餐饮', '交通', '住房', '购物', '娱乐', '医疗', '教育', '其他']
} as const;

const buildRunKey = (input: {
  notebookId: string | null | undefined;
  noteIds: string[];
  dateRange: { from: string; to: string };
  templateId: string;
}) => {
  const ids = [...(input.noteIds || [])].sort().join(',');
  return [
    input.notebookId || '',
    ids,
    input.dateRange?.from || '',
    input.dateRange?.to || '',
    input.templateId || ''
  ].join('|');
};

const applyChartGates = (params: {
  chartType: 'line' | 'bar' | 'pie' | 'heatmap';
  dataset: AnalysisDatum[];
  selected: { timeField?: string; dimensionField?: string; dimensionField2?: string; metricField?: string; aggregation?: string; timeGranularity?: string };
  gates: { pie_topn: number; line_min_points: number; heatmap_min_density: number; field_max_missing_rate: number; bar_max_categories: number };
}) => {
  const { dataset, selected, gates } = params;
  let chartType = params.chartType;

  const dimension = selected.dimensionField || '';
  const metric = selected.metricField || '';
  const timeField = selected.timeField || '';
  const dim2 = selected.dimensionField2 || '';

  const dimStats = dimension ? computeFieldStats(dataset, dimension) : null;
  const timeStats = timeField ? computeFieldStats(dataset, timeField) : null;
  const metricStats = metric && metric !== 'count' ? computeFieldStats(dataset, metric) : null;

  const tooMissing = (s: any) => s && typeof s.missing_rate === 'number' && s.missing_rate > gates.field_max_missing_rate;

  if (tooMissing(dimStats) || tooMissing(timeStats) || tooMissing(metricStats)) {
    // 数据质量太差：优先退化为 count 的 bar
    return { chartType: 'bar' as const, reason: '字段缺失率过高，降级为频次柱状图' };
  }

  if (chartType === 'pie') {
    if (dimStats && dimStats.cardinality > gates.pie_topn) {
      return { chartType: 'bar' as const, reason: '饼图类别过多，降级为柱状图（TopN + 其他）' };
    }
    if (dimStats && dimStats.cardinality > 12 && dimStats.top_share < 0.15) {
      return { chartType: 'bar' as const, reason: '类别过多且占比均匀，饼图不可读，降级为柱状图' };
    }
  }

  if (chartType === 'bar') {
    if (dimStats && dimStats.cardinality > gates.bar_max_categories) {
      return { chartType: 'bar' as const, reason: '类别过多，柱状图将使用 TopN + 其他' };
    }
  }

  if (chartType === 'line') {
    // 折线点数不足：这里仅提示原因，粒度降级后续可做
    if (timeField) {
      const points = new Set<string>();
      dataset.forEach((row) => {
        const v = (row as any)[timeField];
        if (v) points.add(String(v));
      });
      if (points.size > 0 && points.size < gates.line_min_points) {
        return { chartType: 'bar' as const, reason: '时间点过少，不适合折线，降级为柱状图' };
      }
    }
  }

  if (chartType === 'heatmap') {
    if (!dimension || !dim2) {
      return { chartType: 'bar' as const, reason: '热力图缺少第二维度，降级为柱状图' };
    }
    // 稀疏度评估（近似）：以组合出现的比例衡量
    const combos = new Set<string>();
    const dimASet = new Set<string>();
    const dimBSet = new Set<string>();
    dataset.forEach((row) => {
      const a = (row as any)[dimension];
      const b = (row as any)[dim2];
      if (!a || !b) return;
      dimASet.add(String(a));
      dimBSet.add(String(b));
      combos.add(`${a}|||${b}`);
    });
    const totalCells = Math.max(1, dimASet.size * dimBSet.size);
    const density = combos.size / totalCells;
    if (density < gates.heatmap_min_density) {
      return { chartType: 'bar' as const, reason: '热力图过稀疏，不可读，降级为柱状图' };
    }
  }

  return { chartType, reason: '' };
};

const safeParseJSON = (value: unknown): any => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed;
  } catch (error) {
    console.warn('parse json failed', error);
    return null;
  }
};

const formatDateLabel = (value?: string | Date) => {
  if (!value) return '未命名日期';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value.slice(0, 10) : '未命名日期';
  }
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date);
};

const hashString = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const detectScoreFromText = (text: string): number | null => {
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

const detectMoodSource = (text: string): string => {
  const lowered = text.toLowerCase();
  for (const preset of moodSourcePresets) {
    const hit = preset.keywords.some(keyword => lowered.includes(keyword) || text.includes(keyword));
    if (hit) return preset.label;
  }
  return '其他';
};

const extractKeywords = (text: string): string[] => {
  if (!text) return [];
  const chineseMatches = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  const englishMatches = text.match(/[A-Za-z]{4,}/g) || [];
  const merged = [...chineseMatches, ...englishMatches].map(item => item.trim()).filter(Boolean);
  const unique: string[] = [];
  merged.forEach(word => {
    if (!unique.includes(word)) unique.push(word);
  });
  return unique.slice(0, 8);
};

const extractRawFieldValue = (
  note: any,
  field: FieldDefinition,
  fieldNameToIdMap?: Record<string, string>
) => {
  if (!field) return undefined;
  const noteData = note?.component_data || note?.componentData || {};
  const candidateKeys = [
    field.id,
    fieldNameToIdMap?.[field.name],
    field.name,
    field.name?.replace(/\s+/g, ''),
    field.name?.replace(/\s+/g, '_')
  ].filter(Boolean);

  for (const key of candidateKeys) {
    if (!key) continue;
    if (noteData[key] !== undefined) return noteData[key];
    if (note[key] !== undefined) return note[key];
  }
  return undefined;
};

const normalizeFieldValueForDataset = (field: FieldDefinition, rawValue: any) => {
  if (rawValue === null || rawValue === undefined) return undefined;

  const extractLeafValue = (input: any): any => {
    if (input === null || input === undefined) return undefined;
    if (typeof input === 'object' && !Array.isArray(input)) {
      if ('value' in input) return extractLeafValue((input as any).value);
      if ('content' in input) return extractLeafValue((input as any).content);
      if ('text' in input) return extractLeafValue((input as any).text);
      if ('title' in input) return extractLeafValue((input as any).title);
      if ('name' in input) return extractLeafValue((input as any).name);
    }
    return input;
  };

  if (field.role === 'metric') {
    if (typeof rawValue === 'number') return rawValue;
    if (Array.isArray(rawValue)) return rawValue.length;
    const extracted = extractLeafValue(rawValue);
    if (typeof extracted === 'number') return extracted;
    if (typeof extracted === 'string') {
      const parsed = Number(extracted);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  if (Array.isArray(rawValue)) {
    return rawValue
      .map(item => {
        const extracted = extractLeafValue(item);
        if (typeof extracted === 'object') {
          return JSON.stringify(extracted);
        }
        return extracted;
      })
      .filter(Boolean)
      .join(',');
  }

  const extracted = extractLeafValue(rawValue);
  if (typeof extracted === 'object') {
    return JSON.stringify(extracted);
  }
  return extracted;
};

const buildAnalysisDataset = (
  notes: Note[],
  aiValues?: Record<string, Record<string, any>>,
  options?: { fields?: FieldDefinition[]; fieldNameToIdMap?: Record<string, string> }
): AnalysisDatum[] => {
  if (!Array.isArray(notes)) return [];
  const dataset = notes.map((note, index) => {
    const textBlob = [note.title, (note as any)?.summary, note.content, (note as any)?.content_text]
      .filter(Boolean)
      .join(' ');
    const noteId = (note as any).note_id || (note as any).id || `note-${index}`;
    const detectedScoreFromAI =
      aiValues?.mood_score && noteId in aiValues.mood_score
        ? Number(aiValues.mood_score[noteId])
        : null;
    const detectedScore = detectedScoreFromAI ?? detectScoreFromText(textBlob);
    const fallbackSeed = note.note_id || (note as any).id || `${index}`;
    const pseudoScore = (hashString(fallbackSeed + textBlob.slice(0, 12)) % 10) + 1;
    const finalScore = detectedScore ?? pseudoScore;
    const scoreValue = Number(finalScore.toFixed(2));
    const dateRaw = note.created_at || note.updated_at || new Date().toISOString();
    const dateObj = new Date(dateRaw);
    const label = formatDateLabel(dateObj);
    const keywords = extractKeywords(textBlob);
    const moodSource = detectMoodSource(textBlob);
    return {
      id: noteId,
      日期: label,
      日期原始: Number.isNaN(dateObj.getTime()) ? new Date() : dateObj,
      情绪分数:
        aiValues?.mood_score && noteId in (aiValues.mood_score || {})
          ? Number(aiValues.mood_score[noteId])
          : scoreValue,
      情绪类别:
        aiValues?.mood_category && noteId in (aiValues.mood_category || {})
          ? String(aiValues.mood_category[noteId])
          : scoreValue >= 7
            ? '积极'
            : scoreValue >= 4
              ? '中性'
              : '消极',
      情绪来源:
        aiValues?.mood_source && noteId in (aiValues.mood_source || {})
          ? String(aiValues.mood_source[noteId])
          : moodSource,
      情绪关键词:
        aiValues?.mood_keywords && noteId in (aiValues.mood_keywords || {})
          ? (aiValues.mood_keywords[noteId] as string[]) || keywords
          : keywords,
      文本内容: textBlob,
      标题: note.title,
      摘要: (note as any)?.summary || ''
    };
  });

  if (options?.fields?.length) {
    dataset.forEach((row, index) => {
      const note = notes[index];
      options.fields?.forEach(field => {
        const raw = extractRawFieldValue(note, field, options.fieldNameToIdMap);
        if (raw === undefined) return;
        const normalized = normalizeFieldValueForDataset(field, raw);
        if (normalized === undefined || normalized === '') return;
        (row as any)[field.name] = normalized;
      });
    });
  }

  return dataset;
};

const buildSystemFields = (dataset: AnalysisDatum[], notebookType?: string | null): FieldDefinition[] => {
  if (!dataset.length) return [];
  const first = dataset[0];
  const isMoodNotebook =
    typeof notebookType === 'string' && /情绪|心情|mood/i.test(notebookType);

  const scoreFieldName = isMoodNotebook ? '情绪分数' : 'AI 评分';
  const scoreDescription = isMoodNotebook
    ? 'AI 根据文本推测的情绪分值（1-10）'
    : 'AI 根据文本内容生成的综合评分（1-10）';

  const categoryFieldName = isMoodNotebook ? '情绪类别' : 'AI 分类';
  const categoryDescription = isMoodNotebook
    ? '以情绪分数区分的正向/中性/负向标签'
    : '根据 AI 分析结果生成的分类标签';

  const sourceFieldName = isMoodNotebook ? '情绪来源' : 'AI 来源';
  const sourceDescription = isMoodNotebook
    ? '根据文本提取的情绪来源（工作、朋友等）'
    : '根据文本提取的主要来源/场景';

  const keywordFieldName = isMoodNotebook ? '情绪关键词' : 'AI 关键词';
  const keywordDescription = isMoodNotebook
    ? '高频情绪关键词集合，可用于词云或过滤'
    : 'AI 提取的高频关键词集合，可用于词云或过滤';

  const candidates: FieldDefinition[] = [
    {
      id: 'field-date',
      name: '日期',
      role: 'dimension',
      dataType: 'date',
      source: 'system',
      description: '笔记创建日期（自动生成）',
      sampleValue: first.日期
    },
    {
      id: 'field-mood-score',
      name: scoreFieldName,
      role: 'metric',
      dataType: 'number',
      source: 'system',
      description: scoreDescription,
      sampleValue: String(first.情绪分数)
    },
    {
      id: 'field-mood-category',
      name: categoryFieldName,
      role: 'dimension',
      dataType: 'category',
      source: 'system',
      description: categoryDescription,
      sampleValue: first.情绪类别
    },
    {
      id: 'field-mood-source',
      name: sourceFieldName,
      role: 'dimension',
      dataType: 'category',
      source: 'system',
      description: sourceDescription,
      sampleValue: first.情绪来源
    },
    {
      id: 'field-keywords',
      name: keywordFieldName,
      role: 'dimension',
      dataType: 'text',
      source: 'system',
      description: keywordDescription,
      sampleValue: first.情绪关键词?.join('、')
    }
  ];
  return candidates;
};

const aggregateByDimension = (
  dataset: AnalysisDatum[],
  dimensionField: string,
  metricField: string
) => {
  const buckets = new Map<string, { label: string; value: number; count: number }>();
  dataset.forEach(row => {
    const key = row[dimensionField];
    const rawValue = row[metricField];
    const numericValue =
      metricField === 'count'
        ? 1
        : typeof rawValue === 'number'
          ? rawValue
          : Array.isArray(rawValue)
            ? rawValue.length
            : Number(rawValue) || 0;
    const bucket = buckets.get(key) || { label: key, value: 0, count: 0 };
    bucket.value += numericValue;
    bucket.count += 1;
    buckets.set(key, bucket);
  });
  return Array.from(buckets.values()).map(item => ({
    label: item.label,
    value:
      metricField === 'count'
        ? Number(item.value.toFixed(0))
        : Number((item.value / (item.count || 1)).toFixed(2))
  }));
};

const buildSemanticProfile = (
  notesSample: Array<{ title?: string; excerpt?: string }>,
  fields: FieldDefinition[]
) => {
  const text = notesSample
    .map(item => `${item.title || ''} ${item.excerpt || ''}`.trim())
    .join('\n');
  const chinese = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  const english = text.match(/[A-Za-z]{4,}/g) || [];
  const freq = new Map<string, number>();
  [...chinese, ...english].forEach(token => {
    const t = token.trim();
    if (!t) return;
    freq.set(t, (freq.get(t) || 0) + 1);
  });
  const keywords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([k]) => k);

  return {
    keywords,
    field_names: fields.map(f => f.name).filter(Boolean)
  };
};

const computeFieldStats = (dataset: AnalysisDatum[], fieldName: string) => {
  const total = dataset.length || 1;
  let missing = 0;
  const counter = new Map<string, number>();
  dataset.forEach(row => {
    const v = (row as any)[fieldName];
    if (v === null || v === undefined || v === '') {
      missing += 1;
      return;
    }
    const key = String(v);
    counter.set(key, (counter.get(key) || 0) + 1);
  });
  const cardinality = counter.size;
  const top = Array.from(counter.values()).sort((a, b) => b - a)[0] || 0;
  const topShare = top / total;
  return {
    missing_rate: missing / total,
    cardinality,
    top_share: topShare
  };
};

const normalizeSavedChartType = (chartType?: string): ChartType => {
  if (chartType === 'line' || chartType === 'bar' || chartType === 'pie' || chartType === 'heatmap') {
    return chartType;
  }
  return 'line';
};

const buildChartsFromSavedConfig = (
  rawChartConfig: any,
  fields: FieldDefinition[]
): SavedChartConfigResult | null => {
  if (!rawChartConfig || typeof rawChartConfig !== 'object') return null;

  const idToNameMap: Record<string, string> = {};
  fields.forEach(field => {
    if (field.id) {
      idToNameMap[field.id] = field.name;
    }
  });

  const resolveFieldName = (value?: string): string => {
    if (!value) return '';
    return idToNameMap[value] || value;
  };

  const xFieldName = resolveFieldName(rawChartConfig.xAxisField);
  const yFieldName = resolveFieldName(rawChartConfig.yAxisField);

  if (!xFieldName || !yFieldName) {
    return null;
  }

  const chartType = normalizeSavedChartType(rawChartConfig.chartType || rawChartConfig.type);
  const title = rawChartConfig.title || '历史图表配置';

  const candidateId = `saved-${chartType}-${xFieldName}-${yFieldName}`;

  const candidate: ChartCandidate = {
    id: candidateId,
    title,
    chartType,
    icon:
      chartType === 'line'
        ? LineChartIcon
        : chartType === 'bar'
          ? BarChartIcon
          : chartType === 'pie'
            ? PieChartIcon
            : HeatmapIcon,
    reason: '基于上次保存的图表配置',
    requiredDimensions: [xFieldName],
    requiredMetrics: [yFieldName]
  };

  const instance: ChartInstance = {
    id: `chart-saved-${Date.now()}`,
    candidateId,
    title,
    chartType,
    reason: '来自历史 AI 分析配置',
    dimensionCandidates: [xFieldName],
    metricCandidates: [yFieldName],
    selectedDimension: xFieldName,
    selectedMetric: yFieldName,
    filters: [],
    createdAt: Date.now()
  };

  return {
    candidates: [candidate],
    instances: [instance],
    activeChartId: instance.id
  };
};

const generateChartCandidates = (fields: FieldDefinition[], dataset: AnalysisDatum[]): ChartCandidate[] => {
  if (!Array.isArray(fields) || !fields.length) return [];
  if (!Array.isArray(dataset) || !dataset.length) return [];

  const dimensionFields = fields.filter(field => field.role === 'dimension');
  const metricFields = fields.filter(field => field.role === 'metric');

  if (!dimensionFields.length) return [];

  // Step 1：按数据类型拆分维度字段
  const dateDimensions = dimensionFields.filter(field => field.dataType === 'date');
  const categoryDimensions = dimensionFields.filter(
    field => field.dataType === 'category' || field.dataType === 'text'
  );

  const hasMetric = metricFields.length > 0;
  const candidates: ChartCandidate[] = [];
  const usedIds = new Set<string>();

  const slug = (value: string) =>
    value
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '')
      .toLowerCase();

  const pushCandidate = (
    uniqueKey: string,
    title: string,
    chartType: ChartType,
    reason: string,
    dimensionsRequired: string[],
    metricsRequired: string[]
  ) => {
    if (!Array.isArray(dimensionsRequired) || !dimensionsRequired.length) return;
    // 折线图 / 柱状图 / 饼图 / 热力图都必须有数值字段或数量
    if (!Array.isArray(metricsRequired) || !metricsRequired.length) return;
    const id = `${chartType}-${slug(uniqueKey)}`;
    if (usedIds.has(id)) return;
    usedIds.add(id);
    candidates.push({
      id,
      title,
      chartType,
      icon:
        chartType === 'line'
          ? LineChartIcon
          : chartType === 'bar'
            ? BarChartIcon
            : chartType === 'pie'
              ? PieChartIcon
              : HeatmapIcon,
      reason,
      requiredDimensions: dimensionsRequired,
      requiredMetrics: metricsRequired
    });
  };

  // 如果当前还没有任何数值字段，先不推荐图表
  if (!hasMetric) return [];

  const topMetrics = metricFields.slice(0, 3);

  // ✅ 趋势关系：时间 + 数值 → 折线图
  if (dateDimensions.length && metricFields.length) {
    dateDimensions.slice(0, 2).forEach(dim => {
      topMetrics.forEach(metric => {
        pushCandidate(
          `trend-${dim.name}-${metric.name}`,
          `${metric.name}趋势`,
          'line',
          `展示 ${metric.name} 随 ${dim.name} 的变化趋势`,
          [dim.name],
          [metric.name]
        );
      });
    });
  }

  // ✅ 分类对比 / 构成：分类 + 数值 → 柱状图 / 饼图
  if (categoryDimensions.length && metricFields.length) {
    categoryDimensions.slice(0, 2).forEach(dim => {
      topMetrics.forEach(metric => {
        pushCandidate(
          `compare-${dim.name}-${metric.name}`,
          `${dim.name}对比`,
          'bar',
          `比较不同 ${dim.name} 下 ${metric.name} 的差异`,
          [dim.name],
          [metric.name]
        );
      });
    });

    const pieDim = categoryDimensions[0];
    const pieMetric = topMetrics[0] || metricFields[0];

    // 类别数过多时不推荐饼图（只在类别在 2～8 之间时推荐）
    const categorySet = new Set<string>();
    dataset.forEach(row => {
      const value = (row as any)[pieDim.name];
      if (value !== undefined && value !== null && value !== '') {
        categorySet.add(String(value));
      }
    });

    if (categorySet.size >= 2 && categorySet.size <= 8) {
      pushCandidate(
        `distribution-${pieDim.name}-${pieMetric.name}`,
        `${pieDim.name}占比`,
        'pie',
        `查看各 ${pieDim.name} 对 ${pieMetric.name} 的占比构成`,
        [pieDim.name],
        [pieMetric.name]
      );
    }
  }

  // ✅ 二维分布：两个分类 + 数值 → 热力图
	  if (categoryDimensions.length >= 2 && metricFields.length) {
	    const dimA = categoryDimensions[0];
	    const dimB = categoryDimensions[1];
	    const metric = metricFields[0];
	    pushCandidate(
	      `heatmap-${dimA.name}-${dimB.name}`,
	      `${dimA.name}·${dimB.name}热力图`,
	      'heatmap',
	      `观察 ${dimA.name} 与 ${dimB.name} 组合下 ${metric.name} 的强度分布`,
	      [dimA.name, dimB.name],
	      [metric.name]
	    );
	  }

  // ✅ 兜底：任意维度 + 数值 → 柱状图概览
  if (!candidates.length && dimensionFields.length && metricFields.length) {
    const fallbackDim = dimensionFields[0];
    const fallbackMetric = metricFields[0];
    pushCandidate(
      `fallback-${fallbackDim.name}-${fallbackMetric.name}`,
      `${fallbackMetric.name}概览`,
      'bar',
      `基于 ${fallbackDim.name} 展示 ${fallbackMetric.name} 的对比`,
      [fallbackDim.name],
      [fallbackMetric.name]
    );
  }

  return candidates.slice(0, 6);
};

const renderWordCloud = (dataset: AnalysisDatum[]) => {
  const counter = new Map<string, number>();
  dataset.forEach(row => {
    const keywords = row.情绪关键词 || [];
    keywords.forEach(keyword => {
      counter.set(keyword, (counter.get(keyword) || 0) + 1);
    });
  });
  const sorted = Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  return (
    <div className="flex flex-wrap gap-2 p-4">
      {sorted.map(([word, freq], index) => {
        const size = 12 + Math.min(12, freq * 2);
        const color = COLORS[index % COLORS.length];
        return (
          <span
            key={word}
            className="font-medium"
            style={{ fontSize: `${size}px`, color }}
          >
            {word}
          </span>
        );
      })}
      {!sorted.length && <p className="text-sm text-gray-500">暂无可视化关键词</p>}
    </div>
  );
};

const renderChartPreview = (
  chart: ChartInstance,
  dataset: AnalysisDatum[]
) => {
  if (!dataset.length) {
    return <div className="text-sm text-gray-500">暂无可视化数据</div>;
  }

  const [legacyDimension] = (chart as any).dimensions || [];
  const [legacyMetric] = (chart as any).metrics || [];
  const dimension =
    chart.selectedDimension ??
    chart.dimensionCandidates?.[0] ??
    legacyDimension;
  const metric =
    chart.selectedMetric ??
    chart.metricCandidates?.[0] ??
    legacyMetric;

  if (!dimension || !metric) {
    return <div className="text-sm text-gray-500">请先勾选X轴和Y轴</div>;
  }

  if (chart.chartType === 'wordcloud') {
    return renderWordCloud(dataset);
  }

  if (chart.chartType === 'pie') {
    const aggregated = aggregateByDimension(dataset, dimension, metric);
    const pieData = aggregated.map(item => ({
      name: item.label,
      value: item.value
    }));
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            outerRadius={90}
            label
          >
            {pieData.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chart.chartType === 'bar') {
    const aggregated = aggregateByDimension(dataset, dimension, metric);
    return (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={aggregated}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" padding={AXIS_PADDING} />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill="#6E56CF" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chart.chartType === 'area' || chart.chartType === 'heatmap') {
    if (chart.chartType === 'heatmap') {
      const dim2 = (chart as any).selectedDimension2 ?? (chart as any).dimension2Candidates?.[0];
      if (!dim2) {
        return <div className="text-sm text-gray-500">请先选择热力图的第二维度</div>;
      }
      // 简单热力图：二维表格 + 强度颜色
      const xVals: string[] = [];
      const yVals: string[] = [];
      const xSet = new Set<string>();
      const ySet = new Set<string>();
      const cell = new Map<string, number>();
      dataset.forEach((row) => {
        const a = (row as any)[dimension];
        const b = (row as any)[dim2];
        if (a === undefined || a === null || a === '') return;
        if (b === undefined || b === null || b === '') return;
        const xa = String(a);
        const yb = String(b);
        if (!xSet.has(xa)) {
          xSet.add(xa);
          xVals.push(xa);
        }
        if (!ySet.has(yb)) {
          ySet.add(yb);
          yVals.push(yb);
        }
        const key = `${xa}|||${yb}`;
        const raw = metric === 'count' ? 1 : Number((row as any)[metric]) || 0;
        cell.set(key, (cell.get(key) || 0) + raw);
      });
      const values = Array.from(cell.values());
      const max = values.length ? Math.max(...values) : 1;
      const min = values.length ? Math.min(...values) : 0;
      const normalize = (v: number) => {
        if (max === min) return 0.5;
        return (v - min) / (max - min);
      };
      const color = (t: number) => {
        // 绿色系
        const alpha = 0.1 + t * 0.75;
        return `rgba(6, 195, 168, ${alpha})`;
      };
      return (
        <div className="h-[260px] overflow-auto rounded-xl border border-gray-100 bg-white">
          <table className="min-w-max w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-10 bg-white border border-gray-100 px-2 py-2 text-gray-500">
                  {dimension} \\ {dim2}
                </th>
                {yVals.map((yv) => (
                  <th key={yv} className="sticky top-0 z-0 bg-white border border-gray-100 px-2 py-2 text-gray-500">
                    {yv}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {xVals.map((xv) => (
                <tr key={xv}>
                  <td className="sticky left-0 bg-white border border-gray-100 px-2 py-2 text-gray-700 font-medium">
                    {xv}
                  </td>
                  {yVals.map((yv) => {
                    const v = cell.get(`${xv}|||${yv}`) || 0;
                    const t = normalize(v);
                    return (
                      <td
                        key={`${xv}-${yv}`}
                        className="border border-gray-100 px-2 py-2 text-center text-gray-800"
                        style={{ background: v ? color(t) : 'transparent' }}
                        title={`${xv} / ${yv}: ${v}`}
                      >
                        {v ? (metric === 'count' ? v.toFixed(0) : v.toFixed(2)) : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const sorted = aggregateByDimension(
      [...dataset].sort((a, b) => a.日期原始.getTime() - b.日期原始.getTime()),
      dimension,
      metric
    );
    return (
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={sorted}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" padding={AXIS_PADDING} />
          <YAxis />
          <Tooltip />
          <Area type="monotone" dataKey="value" stroke="#A855F7" fill="#E9D5FF" />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  const sorted = aggregateByDimension(
    [...dataset].sort((a, b) => a.日期原始.getTime() - b.日期原始.getTime()),
    dimension,
    metric
  );

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={sorted}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" padding={AXIS_PADDING} />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke="#6366F1" strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  );
};

const inferCandidateChartType = (candidateId?: string): ChartType | null => {
  const id = String(candidateId || '').trim();
  if (!id) return null;
  const tryType = (value: string) => {
    const t = value as ChartType;
    return t === 'line' || t === 'bar' || t === 'pie' || t === 'area' || t === 'heatmap' || t === 'wordcloud'
      ? t
      : null;
  };
  if (id.startsWith('v3-')) {
    return tryType(id.split('-')[1] || '');
  }
  if (id.startsWith('saved-')) {
    return tryType(id.split('-')[1] || '');
  }
  return tryType(id.split('-')[0] || '');
};

interface DraggableFieldListItemProps {
  field: FieldDefinition;
  onDelete: () => void;
}

const DraggableFieldListItem = ({ field, onDelete }: DraggableFieldListItemProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `field-${field.id}`,
    data: {
      fieldName: field.name,
      role: field.role,
      origin: 'field-list'
    }
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform)
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative rounded-2xl border border-[#90dfcb] bg-white px-4 py-2 shadow-sm transition-all ${
        isDragging ? 'ring-2 ring-[#43ccb0] shadow-lg scale-[1.01]' : ''
      }`}
    >
      <button
        type="button"
        onClick={onDelete}
        onPointerDown={event => event.stopPropagation()}
        className="absolute right-3 top-2 rounded-full border border-transparent px-2 text-xs text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
        aria-label="删除字段"
      >
        ×
      </button>
      <div className="flex flex-col pr-6 gap-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 text-xs">{field.name}</span>
          {field.source === 'notebook' && (
            <span className="rounded-full border border-[#90dfcb] bg-[#effdf8] px-2 py-0.5 text-[11px] text-[#0a917a]">
              现有字段
            </span>
          )}
          {field.source === 'system' && (
            <span className="rounded-full border border-[#90dfcb] bg-[#effdf8] px-2 py-0.5 text-[11px] text-[#0a917a]">
              AI生成
            </span>
          )}
          {field.source === 'ai-temp' && (
            <span className="rounded-full border border-[#90dfcb] bg-[#effdf8] px-2 py-0.5 text-[11px] text-[#0a917a]">
              AI 生成
            </span>
          )}
          {field.source === 'custom' && (
            <span className="rounded-full border border-[#90dfcb] bg-[#effdf8] px-2 py-0.5 text-[11px] text-[#0a917a]">
              自定义
            </span>
          )}
        </div>
        {field.description && <span className="text-[11px] text-gray-400">{field.description}</span>}
      </div>
    </div>
  );
};

interface AxisCandidatePillProps {
  fieldName: string;
  slot: AxisSlot;
  role: FieldRole;
  selected: boolean;
  radioGroupName: string;
  onSelect: () => void;
  onRemove: () => void;
}

const AxisCandidatePill = ({ fieldName, slot, role, selected, radioGroupName, onSelect, onRemove }: AxisCandidatePillProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `axis-${slot}-${fieldName}`,
    data: {
      fieldName,
      role,
      origin: 'axis',
      axisSlot: slot
    }
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform)
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-xs transition-all ${
        selected ? 'border-[#06c3a8] bg-[#f0fffa] text-[#065f4f]' : 'border-gray-200 bg-white text-gray-700'
      } ${isDragging ? 'shadow-lg' : ''}`}
    >
      <label className="flex flex-1 items-center gap-2 cursor-pointer select-none">
        <input
          type="radio"
          checked={selected}
          onChange={onSelect}
          name={radioGroupName}
          className="sr-only"
        />
        <span
          className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
            selected ? 'border-[#06c3a8] bg-[#06c3a8] text-white' : 'border-gray-300 bg-white text-transparent'
          }`}
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="truncate">{fieldName}</span>
      </label>
      <button
        type="button"
        onClick={onRemove}
        onPointerDown={event => event.stopPropagation()}
        className="text-gray-400 hover:text-red-500"
        aria-label="移除字段"
      >
        ×
      </button>
    </div>
  );
};

interface AxisDropZoneProps {
  axisSlot: AxisSlot;
  candidates: string[];
  selectedField: string | null;
  radioGroupName: string;
  emptyHint: string;
  onSelect: (fieldName: string, slot: AxisSlot) => void;
  onRemove: (fieldName: string, slot: AxisSlot) => void;
}

const AxisDropZone = ({
  axisSlot,
  candidates,
  selectedField,
  radioGroupName,
  emptyHint,
  onSelect,
  onRemove
}: AxisDropZoneProps) => {
  const dropId =
    axisSlot === 'dimension'
      ? AXIS_DROP_TARGET_IDS.dimension
      : axisSlot === 'dimension2'
        ? AXIS_DROP_TARGET_IDS.dimension2
        : AXIS_DROP_TARGET_IDS.metric;
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  return (
    <div
      ref={setNodeRef}
      className={`space-y-2 rounded-2xl border border-dashed px-3 py-3 transition-colors ${
        isOver ? 'border-[#43ccb0] bg-[#effdf8]' : 'border-gray-100 bg-gray-50/40'
      }`}
    >
      {candidates && candidates.length > 0 ? (
        candidates.map(candidate => (
          <AxisCandidatePill
            key={`${axisSlot}-${candidate}`}
            fieldName={candidate}
            slot={axisSlot}
            role={axisSlot === 'metric' ? 'metric' : 'dimension'}
            radioGroupName={radioGroupName}
            selected={selectedField === candidate}
            onSelect={() => onSelect(candidate, axisSlot)}
            onRemove={() => onRemove(candidate, axisSlot)}
          />
        ))
      ) : (
        <p className="text-[12px] text-gray-400 text-center py-4">{emptyHint}</p>
      )}
      <p className="text-[11px] text-gray-400 text-center">拖出或点击 × 可移除，最多 5 个</p>
    </div>
  );
};

interface AnalysisSettingV2PageProps {
  notebookIdOverride?: string | null;
}

const AnalysisSettingV2Page = ({ notebookIdOverride }: AnalysisSettingV2PageProps = {}) => {
  const { notebookId: notebookIdParam, noteid } = useParams<{
    notebookId?: string;
    noteid?: string;
  }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<AnalysisStage>('idle');
  const [stageMessage, setStageMessage] = useState('');
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [notes, setNotes] = useState<Array<Note & Record<string, any>>>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [aiFields, setAiFields] = useState<FieldDefinition[]>([]);
  const [dataset, setDataset] = useState<AnalysisDatum[]>([]);
  const [chartCandidates, setChartCandidates] = useState<ChartCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [chartInstances, setChartInstances] = useState<ChartInstance[]>([]);
  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'ready'>('idle');
  const [fieldPanelOpen, setFieldPanelOpen] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldRole, setNewFieldRole] = useState<FieldRole>('dimension');
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingFieldName, setEditingFieldName] = useState('');
  const [bootstrapped, setBootstrapped] = useState(false);
  const [fieldNameToIdMap, setFieldNameToIdMap] = useState<Record<string, string>>({});
  const [componentInstancesState, setComponentInstancesState] = useState<ComponentInstance[]>([]);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [tableScrollState, setTableScrollState] = useState({ value: 0, max: 0 });
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [noteFilterDateRange, setNoteFilterDateRange] = useState<{ from: string; to: string }>({
    from: '',
    to: ''
  });
  const [columnWidths, setColumnWidths] = useState<[number, number, number]>([34, 33, 33]);
  const [isDesktop, setIsDesktop] = useState(false);
  const [noteSettingsExpanded, setNoteSettingsExpanded] = useState(true);
  const [configExpanded, setConfigExpanded] = useState(true);
  const [aiPanelExpanded, setAiPanelExpanded] = useState(true);
  const [promptTemplates, setPromptTemplates] = useState<Array<{ id: string; title: string; content: string }>>([
    {
      id: 'default',
      title: '通用分析',
      content:
        '你是一名个人笔记分析助手。请基于用户选定的笔记内容和其中记录的字段，输出简洁、可执行的分析结论与建议。'
    }
  ]);
  const [currentTemplateId, setCurrentTemplateId] = useState('default');
  const [promptTitle, setPromptTitle] = useState('通用分析');
  const [promptTitleDropdownOpen, setPromptTitleDropdownOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(
    '你是一名个人笔记分析助手。请基于用户选定的笔记内容和其中记录的字段，输出简洁、可执行的分析结论与建议。'
  );
  const [aiPromptDraft, setAiPromptDraft] = useState(
    '你是一名个人笔记分析助手。请基于用户选定的笔记内容和其中记录的字段，输出简洁、可执行的分析结论与建议。'
  );
  const [isEditingAiPrompt, setIsEditingAiPrompt] = useState(false);
  const [promptTitleDraft, setPromptTitleDraft] = useState('通用分析');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebookDropdownOpen, setNotebookDropdownOpen] = useState(false);
  const [hoveredNotebookId, setHoveredNotebookId] = useState<string | null>(null);
  const notebookDropdownRef = useRef<HTMLDivElement | null>(null);
  const notebookTriggerRef = useRef<HTMLButtonElement | null>(null);
  const notebookMenuRef = useRef<HTMLDivElement | null>(null);
  const [notebookMenuPos, setNotebookMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [customFieldModalOpen, setCustomFieldModalOpen] = useState(false);
  const [customFieldName, setCustomFieldName] = useState('');
  const [customFieldRole, setCustomFieldRole] = useState<FieldRole>('dimension');
  const [customFieldSubmitting, setCustomFieldSubmitting] = useState(false);
  const [pendingDeleteField, setPendingDeleteField] = useState<FieldDefinition | null>(null);
  const [deleteFieldSubmitting, setDeleteFieldSubmitting] = useState(false);
  const [aiCandidateDropdownOpen, setAiCandidateDropdownOpen] = useState(false);
  const aiCandidateDropdownRef = useRef<HTMLDivElement | null>(null);
  const aiCandidateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const aiCandidateMenuRef = useRef<HTMLDivElement | null>(null);
  const [aiCandidateMenuPos, setAiCandidateMenuPos] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const columnsContainerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    handleIndex: 0 | 1;
    startX: number;
    startWidths: [number, number, number];
    containerWidth: number;
  } | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 5
      }
    })
  );
  const lastRunKeyRef = useRef<string>('');
  const notebookIdFromRoute = notebookIdParam || noteid || null;
  const notebookId = notebookIdOverride || notebookIdFromRoute;

  const allFields = useMemo(() => {
    const map = new Map<string, FieldDefinition>();
    [...fields, ...aiFields].forEach(field => {
      if (!map.has(field.name)) {
        map.set(field.name, field);
      }
    });
    return Array.from(map.values());
  }, [fields, aiFields]);

  const datasetByNoteId = useMemo(() => {
    const map = new Map<string, AnalysisDatum>();
    dataset.forEach(item => {
      if (item.id) {
        map.set(String(item.id), item);
      }
    });
    return map;
  }, [dataset]);

  const notePreview = useMemo(() => notes.slice(0, 10), [notes]);
  const isAnalyzing = analysisStatus === 'analyzing';

  useEffect(() => {
    const loadNotebooks = async () => {
      try {
        const list = await apiClient.getNotebooks();
        setNotebooks(list);
      } catch (loadError) {
        console.warn('[AnalysisSettingV2] 加载笔记本列表失败:', loadError);
      }
    };
    loadNotebooks();
  }, []);

  const updateNotebookMenuPos = useCallback(() => {
    if (!notebookTriggerRef.current) return;
    const rect = notebookTriggerRef.current.getBoundingClientRect();
    setNotebookMenuPos({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notebookDropdownRef.current &&
        !notebookDropdownRef.current.contains(event.target as Node) &&
        (!notebookMenuRef.current || !notebookMenuRef.current.contains(event.target as Node))
      ) {
        setNotebookDropdownOpen(false);
      }

      if (
        aiCandidateDropdownRef.current &&
        !aiCandidateDropdownRef.current.contains(event.target as Node) &&
        (!aiCandidateMenuRef.current || !aiCandidateMenuRef.current.contains(event.target as Node))
      ) {
        setAiCandidateDropdownOpen(false);
      }
    };

    if (notebookDropdownOpen || aiCandidateDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [notebookDropdownOpen, aiCandidateDropdownOpen]);

  const updateAiCandidateMenuPos = useCallback(() => {
    if (!aiCandidateTriggerRef.current) return;
    const rect = aiCandidateTriggerRef.current.getBoundingClientRect();
    setAiCandidateMenuPos({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width
    });
  }, []);

  useEffect(() => {
    if (!aiCandidateDropdownOpen) {
      setAiCandidateMenuPos(null);
      return;
    }
    updateAiCandidateMenuPos();
    const handler = () => updateAiCandidateMenuPos();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [aiCandidateDropdownOpen, updateAiCandidateMenuPos]);

  useEffect(() => {
    if (!notebookDropdownOpen) {
      setNotebookMenuPos(null);
      setHoveredNotebookId(null);
      return;
    }
    updateNotebookMenuPos();
    const handler = () => updateNotebookMenuPos();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [notebookDropdownOpen, updateNotebookMenuPos]);

  const refreshTableScrollState = useCallback(() => {
    const container = tableScrollRef.current;
    if (!container) return;
    const maxScroll = Math.max(container.scrollWidth - container.clientWidth, 0);
    const nextValue = Math.min(container.scrollLeft, maxScroll);
    setTableScrollState(prev =>
      prev.max === maxScroll && Math.abs(prev.value - nextValue) < 1
        ? prev
        : { max: maxScroll, value: nextValue }
    );
  }, []);

  const handleTableSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    const container = tableScrollRef.current;
    if (!container) return;
    container.scrollLeft = nextValue;
    setTableScrollState(prev => ({ ...prev, value: nextValue }));
  };

  useEffect(() => {
    const updateIsDesktop = () => {
      if (typeof window !== 'undefined') {
        setIsDesktop(window.innerWidth >= 1024);
      }
    };
    updateIsDesktop();
    window.addEventListener('resize', updateIsDesktop);
    return () => {
      window.removeEventListener('resize', updateIsDesktop);
    };
  }, []);

  const handleDragStart = (event: React.MouseEvent<HTMLDivElement>, handleIndex: 0 | 1) => {
    if (!columnsContainerRef.current) return;
    event.preventDefault();
    const rect = columnsContainerRef.current.getBoundingClientRect();
    dragStateRef.current = {
      handleIndex,
      startX: event.clientX,
      startWidths: columnWidths,
      containerWidth: rect.width || 1
    };
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state || !columnsContainerRef.current) return;
      if (state.containerWidth <= 0) return;

      const deltaPx = event.clientX - state.startX;
      const deltaPercent = (deltaPx / state.containerWidth) * 100;
      const [w1, w2, w3] = state.startWidths;

      if (state.handleIndex === 0) {
        const minDelta = MIN_COLUMN_PERCENT - w1;
        const maxDelta = w2 - MIN_COLUMN_PERCENT;
        const clampedDelta = Math.max(minDelta, Math.min(maxDelta, deltaPercent));
        const nextW1 = w1 + clampedDelta;
        const nextW2 = w2 - clampedDelta;
        setColumnWidths([nextW1, nextW2, w3]);
      } else {
        const minDelta = MIN_COLUMN_PERCENT - w2;
        const maxDelta = w3 - MIN_COLUMN_PERCENT;
        const clampedDelta = Math.max(minDelta, Math.min(maxDelta, deltaPercent));
        const nextW2 = w2 + clampedDelta;
        const nextW3 = w3 - clampedDelta;
        setColumnWidths([w1, nextW2, nextW3]);
      }
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const container = tableScrollRef.current;
    if (!container) return;
    refreshTableScrollState();
    const handleScroll = () => refreshTableScrollState();
    const handleResize = () => refreshTableScrollState();

    container.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [fieldPanelOpen, refreshTableScrollState]);

  useEffect(() => {
    refreshTableScrollState();
  }, [allFields, fieldPanelOpen, notePreview, refreshTableScrollState]);

  const resolveNoteId = (note: any) => note?.note_id || note?.id || note?.uuid || '';

  const extractDisplayValue = (input: any): string => {
    if (input === null || input === undefined) return '';
    if (typeof input === 'string') return input.trim();
    if (typeof input === 'number' || typeof input === 'boolean') return String(input);
    if (Array.isArray(input)) {
      return input.map(item => extractDisplayValue(item)).filter(Boolean).join(',');
    }
    if (typeof input === 'object') {
      if ('value' in input) return extractDisplayValue((input as any).value);
      if ('content' in input) return extractDisplayValue((input as any).content);
      if ('text' in input) return extractDisplayValue((input as any).text);
      return JSON.stringify(input);
    }
    return String(input);
  };

  const formatDisplayValue = (_fieldName: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.length > 10) {
      return `${trimmed.slice(0, 10)}...`;
    }
    return trimmed;
  };

  const handleCreateCustomAiField = useCallback(async () => {
    if (!notebookId) {
      alert('请先选择笔记本');
      return;
    }
    const analysisNotes =
      selectedNoteIds.length > 0
        ? notes.filter(note => selectedNoteIds.includes(String(resolveNoteId(note))))
        : [];
    if (!analysisNotes.length) {
      alert('请先在上方勾选需要分析的笔记');
      return;
    }

    const trimmedName = customFieldName.trim();
    if (!trimmedName) {
      alert('请输入字段名称');
      return;
    }

    const exists = allFields.some(field => field.name === trimmedName);
    if (exists) {
      alert('已存在同名字段，请更换名称');
      return;
    }

    try {
      setCustomFieldSubmitting(true);
      const noteIdsForAI = analysisNotes
        .map(note => String(resolveNoteId(note)))
        .filter(Boolean);
      const response = await apiClient.post(`/api/notebooks/${notebookId}/custom-ai-field`, {
        fieldName: trimmedName,
        fieldRole: customFieldRole,
        noteIds: noteIdsForAI
      });
      const payload = (response as any)?.data?.data || (response as any)?.data || {};
      const fieldMeta = payload.field || {};
      const values: Record<string, any> = payload.values || {};

      const finalName: string = fieldMeta.name || trimmedName;
      const finalRole: FieldRole =
        fieldMeta.role === 'metric' || fieldMeta.role === 'dimension'
          ? fieldMeta.role
          : customFieldRole;
      const finalDataType: FieldDataType =
        fieldMeta.dataType && ['date', 'number', 'text', 'category'].includes(fieldMeta.dataType)
          ? fieldMeta.dataType
          : finalRole === 'metric'
            ? 'number'
            : 'text';

      const newField: FieldDefinition = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: finalName,
        role: finalRole,
        dataType: finalDataType,
        source: 'custom',
        description: fieldMeta.description || 'AI 基于所选笔记生成的自定义字段'
      };

      setAiFields(prev => [...prev, newField]);
      setDataset(prev =>
        prev.map(row => {
          const key = String(row.id);
          const value = values[key];
          return {
            ...row,
            [finalName]: value !== undefined ? value : row[finalName]
          };
        })
      );
      setCustomFieldModalOpen(false);
      setCustomFieldName('');
      setCustomFieldRole('dimension');
    } catch (error: any) {
      console.error('生成自定义字段失败:', error);
      alert(error?.message || '生成自定义字段失败，请稍后重试');
    } finally {
      setCustomFieldSubmitting(false);
    }
  }, [allFields, customFieldName, customFieldRole, notebookId, notes, selectedNoteIds, resolveNoteId, setDataset, setAiFields]);

  const getNoteFieldValue = useCallback(
    (note: any, field: FieldDefinition) => {
      if (!note) return '';
      const noteData = note.component_data || note.componentData || {};
      const candidateKeys = [
        field.id,
        fieldNameToIdMap[field.name],
        field.name,
        field.name.replace(/\s+/g, ''),
        field.name.replace(/\s+/g, '_')
      ].filter(Boolean);

      for (const key of candidateKeys) {
        if (key && noteData[key] !== undefined) {
          const raw = extractDisplayValue(noteData[key]);
          const formatted = formatDisplayValue(field.name, raw);
          if (formatted) return formatted;
        }
        if (key && note[key] !== undefined) {
          const raw = extractDisplayValue(note[key]);
          const formatted = formatDisplayValue(field.name, raw);
          if (formatted) return formatted;
        }
      }

      if (field.source === 'system' || field.source === 'custom' || field.source === 'ai-temp') {
        const datasetRow = datasetByNoteId.get(String(resolveNoteId(note)));
        if (datasetRow && (datasetRow as any)[field.name] !== undefined) {
          const raw = (datasetRow as any)[field.name];
          const formatted = formatDisplayValue(
            field.name,
            Array.isArray(raw) ? raw.map(item => extractDisplayValue(item)).join(',') : extractDisplayValue(raw)
          );
          if (formatted) return formatted;
        }
      }

      if (field.name.includes('日期')) {
        const fallback = note.created_at || note.updated_at;
        return formatDisplayValue(field.name, extractDisplayValue(fallback));
      }

      return '';
    },
    [datasetByNoteId, fieldNameToIdMap]
  );

  const activeChart = chartInstances.find(chart => chart.id === activeChartId) || chartInstances[0];
  const activeCandidateId = activeChart?.candidateId;
  const defaultCandidateId = chartCandidates[0]?.id || null;

  const loadNotebookNotes = useCallback(async () => {
    if (!notebookId) {
      // 清空当前数据，进入“未选择笔记本”的空状态
      setLoading(false);
      setError(null);
      setStage('idle');
      setStageMessage('');
      setNotebook(null);
      setNotes([]);
      setFields([]);
      setAiFields([]);
      setDataset([]);
      setChartCandidates([]);
      setSelectedCandidateId(null);
      setChartInstances([]);
      setActiveChartId(null);
      setAnalysisStatus('idle');
      return;
    }
    setLoading(true);
    setError(null);
    setStage('loading');
    setStageMessage('加载笔记与字段...');
    try {
      const noteResponse = await apiClient.getNotes(notebookId);
      const notebookInfo: Notebook | null = noteResponse?.notebook ?? null;
      const noteList = noteResponse?.notes ?? [];
      let notebookDetail: Notebook | null = notebookInfo;

      if (!notebookInfo?.component_config) {
        try {
          const remote = await apiClient.get(`/api/notebooks/${notebookId}`);
          if (remote?.data?.notebook) {
            notebookDetail = remote.data.notebook;
          }
        } catch (innerError) {
          console.warn('加载 notebook 详情失败，继续使用 notes 接口返回的数据', innerError);
        }
      }

      const applyDateFilter = (list: Array<any>) => {
        if (!noteFilterDateRange?.from && !noteFilterDateRange?.to) return [...list];
        const fromDate = noteFilterDateRange?.from ? new Date(noteFilterDateRange.from) : null;
        const toDate = noteFilterDateRange?.to ? new Date(noteFilterDateRange.to) : null;
        return list.filter(note => {
          const createdAt = new Date(note.created_at || note.updated_at || note.date || Date.now());
          if (fromDate && createdAt < fromDate) return false;
          if (toDate && createdAt > toDate) return false;
          return true;
        });
      };

      const dateFilteredNotes = applyDateFilter(noteList);
      setNotebook((notebookDetail as Notebook) || notebookInfo);
      setNotes(dateFilteredNotes as Array<Note & Record<string, any>>);

      const analysisNotes =
        selectedNoteIds.length > 0
          ? dateFilteredNotes.filter(note => selectedNoteIds.includes(String(resolveNoteId(note))))
          : [];

      if (!analysisNotes.length) {
        setFields([]);
        setAiFields([]);
        setDataset([]);
        setChartCandidates([]);
        setSelectedCandidateId(null);
        setChartInstances([]);
        setActiveChartId(null);
        setBootstrapped(false);
        setAnalysisStatus('idle');
        setStage('idle');
        setStageMessage('');
        return;
      }

      const parsedInstances: ComponentInstance[] = parseNotebookComponentConfig(
        notebookDetail?.component_config ?? notebookInfo?.component_config ?? null
      );
      setComponentInstancesState(parsedInstances);

      const nameToIdMapping: Record<string, string> = {};
      parsedInstances.forEach(instance => {
        if (instance.title) {
          nameToIdMapping[instance.title] = instance.id;
        }
      });
      setFieldNameToIdMap(nameToIdMapping);

	      const existingFields: FieldDefinition[] = parsedInstances.map(instance => {
	        const meta = componentRoleMap[instance.type] ?? { role: 'dimension', dataType: 'text' };
	        return {
	          id: instance.id,
          name: instance.title || instance.type || '未命名字段',
          role: meta.role,
          dataType: meta.dataType,
          source: 'notebook',
          description: ''
        };
      });

      const currentRunKey = buildRunKey({
        notebookId,
        noteIds: analysisNotes.map(note => String(resolveNoteId(note))).filter(Boolean),
        dateRange: noteFilterDateRange,
        templateId: currentTemplateId
      });

      // 若本次条件未变化，则直接复用当前页面状态（不重复调用 AI）
      if (lastRunKeyRef.current === currentRunKey) {
        setLoading(false);
        return;
      }

      // 结束“加载笔记与字段”的全屏 loading，后续阶段用局部遮罩提示
      setLoading(false);

      // Step 0：构建基础数据集（仅来自模板字段 + 系统基础字段，不依赖旧的 mood_*）
      const generatedDataset = buildAnalysisDataset(analysisNotes, undefined, {
        fields: existingFields,
        fieldNameToIdMap: nameToIdMapping
      });
      generatedDataset.sort((a, b) => a.日期原始.getTime() - b.日期原始.getTime());

      const systemFields = buildSystemFields(
        generatedDataset,
        (notebookDetail as Notebook | null)?.type ?? notebookInfo?.type ?? null
      ).filter(
        field => !existingFields.some(item => item.name === field.name)
      );

      const baseFields = [...existingFields, ...systemFields];
      const notesSample = analysisNotes.slice(0, 24).map(note => {
        const id = String(resolveNoteId(note));
        const title = note.title || '';
        const excerpt = String(note.content_text || note.content || '').slice(0, 220);
        const created_at = note.created_at || note.updated_at || '';
        return { id, title, excerpt, created_at };
      });
      const semanticProfile = buildSemanticProfile(notesSample, baseFields);

      // Phase 1: 推荐模式（Prompt 1）
      setAnalysisStatus('analyzing');
      setStage('recommending');
      setStageMessage('AI正在竭力为您分析...');
      const recommendResp = await apiClient.recommendAIChart({
        fields: baseFields.map(f => ({
          name: f.name,
          role: f.role,
          data_type: f.dataType,
          source: f.source,
          example: f.sampleValue
        })),
        notes_sample: notesSample,
        semantic_profile: semanticProfile,
        policy_overrides: AI_CHART_POLICY_OVERRIDES as any,
        fixed_vocabularies: AI_CHART_FIXED_VOCABULARIES as any
      });
      const recommendData = recommendResp?.data || {};
      const recommendedChartType: 'line' | 'bar' | 'pie' | 'heatmap' =
        ['line', 'bar', 'pie', 'heatmap'].includes(recommendData.chart_type) ? recommendData.chart_type : 'bar';
      const fieldPlan = recommendData.field_plan || {};
      const missingFields: any[] = Array.isArray(fieldPlan.missing_fields) ? fieldPlan.missing_fields : [];

      // Phase 2: 缺口字段生成（Prompt 2）
      const generatedAiFields: FieldDefinition[] = [];
      if (missingFields.length > 0) {
        setStage('deriving_fields');
        setStageMessage('AI 正在生成图表所需字段...');
        const deriveResp = await apiClient.deriveAIChartFields({
          missing_fields: missingFields,
          notes: analysisNotes.slice(0, 220).map(note => ({
            id: String(resolveNoteId(note)),
            title: note.title || '',
            excerpt: String(note.content_text || note.content || '').slice(0, 400)
          })),
          policy_overrides: AI_CHART_POLICY_OVERRIDES as any,
          fixed_vocabularies: AI_CHART_FIXED_VOCABULARIES as any
        });
        const deriveData = deriveResp?.data || {};
        const fieldValues = deriveData.field_values && typeof deriveData.field_values === 'object' ? deriveData.field_values : {};

        // 写入 dataset
        const byId = new Map<string, any>();
        generatedDataset.forEach(row => byId.set(String(row.id), row));
        Object.keys(fieldValues).forEach((fieldName) => {
          const map = fieldValues[fieldName] || {};
          Object.keys(map).forEach((noteId) => {
            const row = byId.get(String(noteId));
            if (row) {
              (row as any)[fieldName] = map[noteId];
            }
          });
        });

        // 生成 aiFields 定义
        missingFields.forEach((mf) => {
          const name = String(mf?.name || '').trim();
          if (!name) return;
          const role: FieldRole = mf?.role === 'metric' ? 'metric' : 'dimension';
          const dt: FieldDataType =
            mf?.data_type === 'number'
              ? 'number'
              : mf?.data_type === 'date'
                ? 'date'
                : mf?.data_type === 'category'
                  ? 'category'
                  : 'text';
          generatedAiFields.push({
            id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            role,
            dataType: dt,
            source: 'ai-temp',
            description: mf?.meaning || mf?.explain_template || 'AI 生成字段'
          });
        });
      }

      // 更新字段表 + 数据集
      setFields(baseFields);
      setAiFields(generatedAiFields);
      setDataset(generatedDataset);

      const allFieldsNow = [...baseFields, ...generatedAiFields];
      const allFieldNames = new Set(allFieldsNow.map(f => f.name));

      // Phase 3: 字段择优（Prompt 1.5，条件触发）
      const timeCandidates = (fieldPlan.time_field_candidates || [])
        .map((c: any) => c?.name)
        .filter(Boolean)
        .filter((n: string) => allFieldNames.has(n));
      const dimensionCandidates = (fieldPlan.dimension_candidates || [])
        .map((c: any) => c?.name)
        .filter(Boolean)
        .filter((n: string) => allFieldNames.has(n));
      const metricCandidates = (fieldPlan.metric_candidates || [])
        .map((c: any) => c?.name)
        .filter(Boolean)
        .filter((n: string) => n === 'count' || allFieldNames.has(n));

      const gates = (AI_CHART_POLICY_OVERRIDES as any).gates || {};
      const filterByMissing = (names: string[]) =>
        names.filter((n) => {
          if (n === 'count') return true;
          const s = computeFieldStats(generatedDataset, n);
          return s.missing_rate <= (gates.field_max_missing_rate ?? 0.4);
        });

      const filteredTime = filterByMissing(timeCandidates);
      const filteredDim = filterByMissing(dimensionCandidates);
      const filteredMetric = filterByMissing(metricCandidates);

      const needRerank =
        filteredTime.length + filteredDim.length + filteredMetric.length >= 4 ||
        filteredTime.length > 1 ||
        filteredDim.length > 1 ||
        filteredMetric.length > 1;

      let selected = {
        timeField: String(fieldPlan?.selected?.time_field || ''),
        dimensionField: String(fieldPlan?.selected?.dimension || ''),
        dimensionField2: '',
        metricField: String(fieldPlan?.selected?.metric || ''),
        aggregation: String(fieldPlan?.aggregation || 'count'),
        timeGranularity: String(fieldPlan?.time_granularity || 'none')
      };

      if (needRerank) {
        setStage('reranking');
        setStageMessage('AI 正在从候选字段中择优...');
        const stats: Record<string, any> = {};
        [...new Set([...filteredTime, ...filteredDim, ...filteredMetric].filter((n) => n !== 'count'))].forEach((name) => {
          stats[name] = computeFieldStats(generatedDataset, name);
        });
        const rerankResp = await apiClient.rerankAIChartFields({
          chart_type: recommendedChartType,
          candidate_fields: {
            time: filteredTime,
            dimension: filteredDim,
            metric: filteredMetric
          },
          field_stats: stats,
          semantic_profile: semanticProfile,
          policy_overrides: AI_CHART_POLICY_OVERRIDES as any,
          fixed_vocabularies: AI_CHART_FIXED_VOCABULARIES as any
        });
        const rerankData = rerankResp?.data || {};
        const sf = rerankData.selected_fields || {};
        selected = {
          timeField: String(sf.time_field || selected.timeField || ''),
          dimensionField: String(sf.dimension_field || selected.dimensionField || ''),
          dimensionField2: String(sf.dimension_field_2 || ''),
          metricField: String(sf.metric_field || selected.metricField || ''),
          aggregation: String(sf.aggregation || selected.aggregation || 'count'),
          timeGranularity: String(sf.time_granularity || selected.timeGranularity || 'none')
        };
      }

      // Phase 4: Gates（质量门槛与降级）
      const gateResult = applyChartGates({
        chartType: recommendedChartType,
        dataset: generatedDataset,
        selected,
        gates: (AI_CHART_POLICY_OVERRIDES as any).gates
      });
      const finalChartType = gateResult.chartType;

      const aiBaseReason = [recommendData.why, gateResult.reason].filter(Boolean).join('；') || 'AI 推荐';

      const getXFieldForType = (chartType: ChartType) => {
        if (chartType === 'line') {
          return selected.timeField || filteredTime[0] || filteredDim[0] || systemFields[0]?.name || '';
        }
        if (chartType === 'heatmap') {
          return selected.dimensionField || filteredDim[0] || filteredTime[0] || systemFields[0]?.name || '';
        }
        return selected.dimensionField || filteredDim[0] || filteredTime[0] || systemFields[0]?.name || '';
      };

      const getSecondDimForHeatmap = () => {
        return selected.dimensionField2 || filteredDim[1] || filteredTime[1] || '';
      };

      const yField = selected.metricField || filteredMetric[0] || 'count';

      const makeCandidateVariant = (chartType: ChartType, isAiRecommended: boolean): ChartCandidate => {
        const xField = getXFieldForType(chartType);
        const heatmapSecondDim = chartType === 'heatmap' ? getSecondDimForHeatmap() : '';
        const requiredDimensions =
          chartType === 'heatmap'
            ? [xField, heatmapSecondDim].filter(Boolean)
            : xField
              ? [xField]
              : [];

        const suffix = isAiRecommended
          ? 'AI 推荐'
          : `可切换为${CHART_TYPE_LABELS[chartType] || chartType}查看同一组字段的不同视图`;

        return {
          id: `v3-${chartType}-${requiredDimensions.join('|')}-${yField}`,
          title: recommendData.core_question || recommendData.title || 'AI 推荐图表',
          chartType,
          icon:
            chartType === 'line'
              ? LineChartIcon
              : chartType === 'bar'
                ? BarChartIcon
                : chartType === 'pie'
                  ? PieChartIcon
                  : HeatmapIcon,
          reason: [aiBaseReason, suffix].filter(Boolean).join('；'),
          requiredDimensions,
          requiredMetrics: yField ? [yField] : []
        };
      };

      const allChartTypes: ChartType[] = ['line', 'bar', 'pie', 'heatmap'];
      const aiCandidate = makeCandidateVariant(finalChartType, true);
      const extraCandidates = allChartTypes
        .filter(type => type !== finalChartType)
        .map(type => makeCandidateVariant(type, false));
      const candidates = [aiCandidate, ...extraCandidates];

      const ensuredForInstance = ensureFieldsForCandidate(aiCandidate);
      const initialDimensionCandidates = ensuredForInstance.dimensions.slice(0, 5);
      const initialMetricCandidates = ensuredForInstance.metrics.slice(0, 5);
      const isHeatmap = aiCandidate.chartType === 'heatmap';
      const instanceDimensionCandidates = isHeatmap ? initialDimensionCandidates.slice(0, 1) : initialDimensionCandidates;
      const instanceDimension2Candidates = isHeatmap ? initialDimensionCandidates.slice(1, 2) : [];

      const instance: ChartInstance = {
        id: `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        candidateId: aiCandidate.id,
        title: aiCandidate.title,
        chartType: aiCandidate.chartType,
        reason: aiCandidate.reason,
        dimensionCandidates: instanceDimensionCandidates,
        dimension2Candidates: instanceDimension2Candidates,
        metricCandidates: initialMetricCandidates,
        selectedDimension: instanceDimensionCandidates[0] ?? null,
        selectedDimension2: instanceDimension2Candidates[0] ?? null,
        selectedMetric: initialMetricCandidates[0] ?? null,
        filters: [],
        createdAt: Date.now()
      };

      setChartCandidates(candidates);
      setSelectedCandidateId(aiCandidate.id);
      setChartInstances([instance]);
      setActiveChartId(instance.id);
      setBootstrapped(true);
      setAnalysisStatus('ready');
      setStage('ready');
      setStageMessage('');
      lastRunKeyRef.current = currentRunKey;
    } catch (fetchError: any) {
      console.error('加载分析数据失败', fetchError);
      setError(fetchError.message || '加载分析数据失败');
      setAnalysisStatus('idle');
      setStage('error');
      setStageMessage(fetchError.message || '加载分析数据失败');
    } finally {
      // 若仍处于 loading（异常中断时），确保关闭
      setLoading(false);
    }
  }, [notebookId, selectedNoteIds, noteFilterDateRange, currentTemplateId]);

  useEffect(() => {
    loadNotebookNotes();
  }, [loadNotebookNotes]);

  const ensureFieldsForCandidate = useCallback(
    (candidate: ChartCandidate) => {
      const missingFields: FieldDefinition[] = [];
      const addField = (name: string, role: FieldRole): string => {
        const existing = allFields.find(field => field.name === name);
        if (existing) return existing.name;
        const newField: FieldDefinition = {
          id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          role,
          dataType: role === 'metric' ? 'number' : 'text',
          source: 'ai-temp',
          description: `AI 为「${candidate.title}」推测的字段`
        };
        missingFields.push(newField);
        return newField.name;
      };

      const ensuredDimensions = candidate.requiredDimensions.map(fieldName =>
        addField(fieldName, 'dimension')
      );
      const ensuredMetrics = candidate.requiredMetrics.map(fieldName =>
        addField(fieldName, 'metric')
      );

      if (missingFields.length) {
        setAiFields(prev => {
          const map = new Map<string, FieldDefinition>();
          prev.forEach(field => map.set(field.name, field));
          missingFields.forEach(field => {
            if (!map.has(field.name)) {
              map.set(field.name, field);
            }
          });
          return Array.from(map.values());
        });
      }

      return { dimensions: ensuredDimensions, metrics: ensuredMetrics };
    },
    [allFields]
  );

  const handleAddChart = useCallback(
    (candidate: ChartCandidate, auto = false) => {
      const ensured = ensureFieldsForCandidate(candidate);
      const initialDimensionCandidates = ensured.dimensions.slice(0, 5);
      const initialMetricCandidates = ensured.metrics.slice(0, 5);
      const isHeatmap = candidate.chartType === 'heatmap';
      const dimensionCandidates = isHeatmap ? initialDimensionCandidates.slice(0, 1) : initialDimensionCandidates;
      const dimension2Candidates = isHeatmap ? initialDimensionCandidates.slice(1, 2) : [];
      const newChart: ChartInstance = {
        id: `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        candidateId: candidate.id,
        title: candidate.title,
        chartType: candidate.chartType,
        reason: candidate.reason,
        dimensionCandidates,
        dimension2Candidates: dimension2Candidates,
        metricCandidates: initialMetricCandidates,
        selectedDimension: dimensionCandidates[0] ?? null,
        selectedDimension2: dimension2Candidates[0] ?? null,
        selectedMetric: initialMetricCandidates[0] ?? null,
        filters: [],
        createdAt: Date.now()
      };
      setChartInstances(prev => [...prev, newChart]);
      setActiveChartId(newChart.id);
      if (!auto) {
        setBootstrapped(true);
      }
    },
    [ensureFieldsForCandidate]
  );

  useEffect(() => {
    if (!selectedCandidateId && chartCandidates.length > 0) {
      setSelectedCandidateId(chartCandidates[0].id);
    }
  }, [chartCandidates, selectedCandidateId]);

  const handleSelectCandidate = useCallback(
    (candidate: ChartCandidate) => {
      setSelectedCandidateId(candidate.id);
      setChartInstances(prev => {
        const ensured = ensureFieldsForCandidate(candidate);
        const initialDimensionCandidates = ensured.dimensions.slice(0, 5);
        const initialMetricCandidates = ensured.metrics.slice(0, 5);
        const isHeatmap = candidate.chartType === 'heatmap';
        const dimensionCandidates = isHeatmap ? initialDimensionCandidates.slice(0, 1) : initialDimensionCandidates;
        const dimension2Candidates = isHeatmap ? initialDimensionCandidates.slice(1, 2) : [];

        const build = (base: Partial<ChartInstance> = {}) =>
          ({
            id: String(base.id || `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
            candidateId: candidate.id,
            title: candidate.title,
            chartType: candidate.chartType,
            reason: candidate.reason,
            dimensionCandidates,
            dimension2Candidates,
            metricCandidates: initialMetricCandidates,
            selectedDimension: dimensionCandidates[0] ?? null,
            selectedDimension2: dimension2Candidates[0] ?? null,
            selectedMetric: initialMetricCandidates[0] ?? null,
            filters: Array.isArray(base.filters) ? base.filters : [],
            createdAt: typeof base.createdAt === 'number' ? base.createdAt : Date.now()
          }) as ChartInstance;

        if (!prev.length) {
          const next = build();
          setActiveChartId(next.id);
          return [next];
        }

        const target = prev.find(c => c.id === activeChartId) || prev[0];
        const next = build(target);
        setActiveChartId(next.id);
        return prev.map(c => (c.id === target.id ? next : c));
      });
    },
    [activeChartId, ensureFieldsForCandidate]
  );

  useEffect(() => {
    if (!bootstrapped && chartCandidates.length > 0 && chartInstances.length === 0) {
      handleAddChart(chartCandidates[0], true);
      setBootstrapped(true);
    }
  }, [chartCandidates, chartInstances.length, bootstrapped, handleAddChart]);

  const getAxisKeys = (slot: AxisSlot) => {
    if (slot === 'metric') {
      return { candidateKey: 'metricCandidates' as const, selectedKey: 'selectedMetric' as const };
    }
    if (slot === 'dimension2') {
      return { candidateKey: 'dimension2Candidates' as const, selectedKey: 'selectedDimension2' as const };
    }
    return { candidateKey: 'dimensionCandidates' as const, selectedKey: 'selectedDimension' as const };
  };

  const addFieldToAxis = (fieldName: string, slot: AxisSlot) => {
    if (!activeChart) return;
    setChartInstances(prev =>
      prev.map(chart => {
        if (chart.id !== activeChart.id) return chart;
        const { candidateKey, selectedKey } = getAxisKeys(slot);
        const existing = (chart as any)[candidateKey] || [];
        if (existing.includes(fieldName)) {
          return (chart as any)[selectedKey]
            ? chart
            : { ...chart, [selectedKey]: (chart as any)[selectedKey] ?? fieldName };
        }
        if (existing.length >= 5) {
          alert(`${slot === 'metric' ? 'Y' : 'X'}轴最多可保留 5 个候选字段`);
          return chart;
        }
        return {
          ...chart,
          [candidateKey]: [...existing, fieldName],
          [selectedKey]: (chart as any)[selectedKey] ?? fieldName
        };
      })
    );
  };

  const handleChartTypeChange = (chartId: string, nextType: ChartType) => {
    setChartInstances(prev =>
      prev.map(chart => {
        if (chart.id !== chartId) return chart;
        if (chart.chartType === nextType) return chart;

        if (nextType === 'heatmap') {
          const dimensionCandidates = Array.isArray(chart.dimensionCandidates) ? chart.dimensionCandidates : [];
          const metricCandidates = Array.isArray(chart.metricCandidates) ? chart.metricCandidates : [];
          const fallbackDim2 = dimensionCandidates[1] || '';
          const dimension2Candidates = Array.isArray((chart as any).dimension2Candidates)
            ? ((chart as any).dimension2Candidates as string[])
            : (fallbackDim2 ? [fallbackDim2] : []);
          const selectedDimension2 =
            (chart as any).selectedDimension2 ??
            dimension2Candidates[0] ??
            null;

          return {
            ...chart,
            chartType: nextType,
            dimensionCandidates: dimensionCandidates.slice(0, 1),
            dimension2Candidates: dimension2Candidates.slice(0, 5),
            selectedDimension: (chart.selectedDimension ?? dimensionCandidates[0] ?? null),
            selectedDimension2,
            selectedMetric: chart.selectedMetric ?? metricCandidates[0] ?? null
          };
        }

        return {
          ...chart,
          chartType: nextType
        };
      })
    );
  };

  const removeFieldFromAxis = (fieldName: string, slot: AxisSlot) => {
    if (!activeChartId) return;
    setChartInstances(prev =>
      prev.map(chart => {
        if (chart.id !== activeChartId) return chart;
        const { candidateKey, selectedKey } = getAxisKeys(slot);
        const candidates = (chart as any)[candidateKey] || [];
        if (!candidates.includes(fieldName)) return chart;
        const updated = candidates.filter((item: string) => item !== fieldName);
        const wasSelected = (chart as any)[selectedKey] === fieldName;
        return {
          ...chart,
          [candidateKey]: updated,
          [selectedKey]: wasSelected ? updated[0] ?? null : (chart as any)[selectedKey]
        };
      })
    );
  };

  const handleAxisSelectionChange = (fieldName: string, slot: AxisSlot) => {
    if (!activeChartId) return;
    setChartInstances(prev =>
      prev.map(chart => {
        if (chart.id !== activeChartId) return chart;
        const { candidateKey, selectedKey } = getAxisKeys(slot);
        const candidates = (chart as any)[candidateKey] || [];
        if (!candidates.includes(fieldName)) return chart;
        return {
          ...chart,
          [selectedKey]: fieldName
        };
      })
    );
  };

  const handleFieldDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!active) return;
      const fieldName = active.data?.current?.fieldName as string | undefined;
      const role = active.data?.current?.role as FieldRole | undefined;
      const origin = active.data?.current?.origin as 'field-list' | 'axis' | undefined;
      const axisSlot = (active.data?.current?.axisSlot as AxisSlot | undefined) || (role === 'metric' ? 'metric' : 'dimension');
      if (!fieldName) return;
      if (origin === 'field-list' && role) {
        if (over?.id === AXIS_DROP_TARGET_IDS.dimension && role === 'dimension') {
          addFieldToAxis(fieldName, 'dimension');
        } else if (over?.id === AXIS_DROP_TARGET_IDS.dimension2 && role === 'dimension') {
          addFieldToAxis(fieldName, 'dimension2');
        } else if (over?.id === AXIS_DROP_TARGET_IDS.metric && role === 'metric') {
          addFieldToAxis(fieldName, 'metric');
        }
      } else if (origin === 'axis') {
        if (over?.id === AXIS_DROP_TARGET_IDS.dimension && axisSlot === 'dimension') {
          return;
        }
        if (over?.id === AXIS_DROP_TARGET_IDS.dimension2 && axisSlot === 'dimension2') {
          return;
        }
        if (over?.id === AXIS_DROP_TARGET_IDS.metric && axisSlot === 'metric') {
          return;
        }
        removeFieldFromAxis(fieldName, axisSlot);
      }
    },
    [addFieldToAxis, removeFieldFromAxis]
  );

  const removeFieldFromCharts = useCallback((fieldName: string) => {
    setChartInstances(prev =>
      prev.map(chart => {
        const dimensionCandidates = (chart.dimensionCandidates || []).filter(field => field !== fieldName);
        const dimension2Candidates = ((chart as any).dimension2Candidates || []).filter((field: string) => field !== fieldName);
        const metricCandidates = (chart.metricCandidates || []).filter(field => field !== fieldName);
        return {
          ...chart,
          dimensionCandidates,
          dimension2Candidates,
          metricCandidates,
          selectedDimension: chart.selectedDimension === fieldName ? dimensionCandidates[0] ?? null : chart.selectedDimension,
          selectedDimension2: (chart as any).selectedDimension2 === fieldName ? dimension2Candidates[0] ?? null : (chart as any).selectedDimension2,
          selectedMetric: chart.selectedMetric === fieldName ? metricCandidates[0] ?? null : chart.selectedMetric
        };
      })
    );
  }, []);

  const replaceFieldInCharts = useCallback((oldName: string, newName: string) => {
    if (oldName === newName) return;
    setChartInstances(prev =>
      prev.map(chart => {
        const dimensionCandidates = (chart.dimensionCandidates || []).map(field => (field === oldName ? newName : field));
        const dimension2Candidates = ((chart as any).dimension2Candidates || []).map((field: string) => (field === oldName ? newName : field));
        const metricCandidates = (chart.metricCandidates || []).map(field => (field === oldName ? newName : field));
        return {
          ...chart,
          dimensionCandidates,
          dimension2Candidates,
          metricCandidates,
          selectedDimension: chart.selectedDimension === oldName ? newName : chart.selectedDimension,
          selectedDimension2: (chart as any).selectedDimension2 === oldName ? newName : (chart as any).selectedDimension2,
          selectedMetric: chart.selectedMetric === oldName ? newName : chart.selectedMetric
        };
      })
    );
  }, []);

  const handleRemoveChart = (chartId: string) => {
    setChartInstances(prev => {
      const filtered = prev.filter(chart => chart.id !== chartId);
      if (activeChartId === chartId) {
        setActiveChartId(filtered[0]?.id || null);
      }
      return filtered;
    });
  };

  const handleCreateField = async () => {
    if (!newFieldName.trim()) return;
    const trimmed = newFieldName.trim();
    const exists = allFields.some(field => field.name === trimmed);
    if (exists) {
      setNewFieldName('');
      return;
    }

    if (!notebookId) {
      const newField: FieldDefinition = {
        id: `ai-${Date.now()}`,
        name: trimmed,
        role: newFieldRole,
        dataType: newFieldRole === 'metric' ? 'number' : 'text',
        source: 'ai-temp',
        description: '用户在字段表中新增的字段'
      };
      setAiFields(prev => [...prev, newField]);
      setNewFieldName('');
      return;
    }

    const componentType: ComponentType = newFieldRole === 'metric' ? 'number' : 'text-short';
    const newInstance = createComponentInstance(componentType, { title: trimmed });
    const updatedInstances = [...componentInstancesState, newInstance];
    try {
      await apiClient.put(`/api/notebooks/${notebookId}`, {
        componentConfig: {
          componentInstances: updatedInstances
        }
      });
      setComponentInstancesState(updatedInstances);

      const meta = componentRoleMap[componentType] ?? {
        role: newFieldRole,
        dataType: newFieldRole === 'metric' ? 'number' : 'text'
      };
      const newField: FieldDefinition = {
        id: newInstance.id,
        name: trimmed,
        role: meta.role,
        dataType: meta.dataType,
        source: 'notebook',
        description: '用户在字段表中新增的字段'
      };
      setFields(prev => [...prev, newField]);
      setFieldNameToIdMap(prev => ({ ...prev, [trimmed]: newInstance.id }));
    } catch (error) {
      console.error('新增字段失败:', error);
      alert('新增字段失败，请稍后重试');
    } finally {
      setNewFieldName('');
    }
  };

  const beginEditField = (field: FieldDefinition) => {
    setEditingFieldId(field.id);
    setEditingFieldName(field.name);
    setFieldPanelOpen(true);
  };

  const cancelEditField = () => {
    setEditingFieldId(null);
    setEditingFieldName('');
  };

  const handleSaveFieldEdit = async () => {
    if (!editingFieldId) return;
    const targetField = allFields.find(field => field.id === editingFieldId);
    if (!targetField) return;
    const nextName = editingFieldName.trim();
    if (!nextName) {
      cancelEditField();
      return;
    }
    const duplicate = allFields.some(field => field.id !== editingFieldId && field.name === nextName);
    if (duplicate) {
      alert('已存在同名字段，请更换名称');
      return;
    }

    const updateLocalField = () => {
      if (targetField.source === 'ai-temp' || targetField.source === 'custom') {
        setAiFields(prev =>
          prev.map(field =>
            field.id === editingFieldId ? { ...field, name: nextName } : field
          )
        );
        return;
      }
      setFields(prev =>
        prev.map(field =>
          field.id === editingFieldId ? { ...field, name: nextName } : field
        )
      );
      if (targetField.source === 'notebook') {
        setFieldNameToIdMap(prev => {
          const nextMap = { ...prev };
          const fieldId = targetField.id || prev[targetField.name];
          if (fieldId) {
            delete nextMap[targetField.name];
            nextMap[nextName] = fieldId;
          }
          return nextMap;
        });
      }
    };

    if (targetField.source === 'notebook') {
      if (!notebookId) {
        alert('缺少 notebookId，无法保存字段修改');
        return;
      }
      const updatedInstances = componentInstancesState.map(instance => {
        if (instance.id === targetField.id || instance.title === targetField.name) {
          return { ...instance, title: nextName };
        }
        return instance;
      });
      try {
        await apiClient.put(`/api/notebooks/${notebookId}`, {
          componentConfig: {
            componentInstances: updatedInstances
          }
        });
        setComponentInstancesState(updatedInstances);
        updateLocalField();
        replaceFieldInCharts(targetField.name, nextName);
        cancelEditField();
      } catch (error) {
        console.error('更新字段失败:', error);
        alert('更新字段失败，请稍后重试');
      }
      return;
    }

    updateLocalField();
    replaceFieldInCharts(targetField.name, nextName);
    cancelEditField();
  };

  const handleDeleteField = async (field: FieldDefinition) => {
    const fieldName = field.name;
    const cleanup = () => removeFieldFromCharts(fieldName);
    if (editingFieldId === field.id) {
      cancelEditField();
    }

    if (field.source === 'ai-temp' || field.source === 'custom') {
      setAiFields(prev => prev.filter(item => item.name !== fieldName));
      cleanup();
      return;
    }

    if (field.source === 'system') {
      setFields(prev => prev.filter(item => item.name !== fieldName));
      cleanup();
      return;
    }

    if (field.source === 'notebook') {
      const fieldId = field.id || fieldNameToIdMap[fieldName];
      if (!fieldId || !notebookId) {
        console.warn('无法删除字段，缺少字段ID或 notebookId', { field });
        return;
      }

      const updatedInstances = componentInstancesState.filter(instance => instance.id !== fieldId);
      try {
        await apiClient.put(`/api/notebooks/${notebookId}`, {
          componentConfig: {
            componentInstances: updatedInstances
          }
        });
        setComponentInstancesState(updatedInstances);
        setFields(prev => prev.filter(item => item.name !== fieldName));
        setFieldNameToIdMap(prev => {
          const next = { ...prev };
          delete next[fieldName];
          return next;
        });
        cleanup();
      } catch (error) {
        console.error('删除字段失败:', error);
        alert('删除字段失败，请稍后重试');
      }
    }
  };

  const filteredFields = allFields.filter(field =>
    field.name.toLowerCase().includes(fieldSearch.toLowerCase())
  );

  const selectableNoteIds = useMemo(
    () =>
      notes
        .map(note => String(resolveNoteId(note)))
        .filter((id): id is string => Boolean(id)),
    [notes]
  );

  const isAllSelectableNotesChecked = useMemo(
    () =>
      selectableNoteIds.length > 0 &&
      selectableNoteIds.every(id => selectedNoteIds.includes(id)),
    [selectableNoteIds, selectedNoteIds]
  );

  const handleToggleNoteSelection = (noteId: string) => {
    const id = String(noteId);
    setSelectedNoteIds(prev =>
      prev.includes(id) ? prev.filter(existing => existing !== id) : [...prev, id]
    );
  };

  const handleSelectAllNotesToggle = () => {
    if (!selectableNoteIds.length) return;
    if (isAllSelectableNotesChecked) {
      setSelectedNoteIds(prev => prev.filter(id => !selectableNoteIds.includes(id)));
    } else {
      setSelectedNoteIds(prev => {
        const set = new Set(prev);
        selectableNoteIds.forEach(id => set.add(id));
        return Array.from(set);
      });
    }
  };

  const handleDateFilterChange = (partial: { from?: string; to?: string }) => {
    setNoteFilterDateRange(prev => ({
      from: partial.from !== undefined ? partial.from : prev.from,
      to: partial.to !== undefined ? partial.to : prev.to
    }));
  };

  const handleNotebookChange = (targetNotebookId: string) => {
    // 空字符串表示“请选择笔记本”，跳转到没有 notebookId 的入口
    if (!targetNotebookId) {
      navigate('/analysis/v2', { replace: false });
      return;
    }
    if (targetNotebookId === notebookId) {
      setNotebookDropdownOpen(false);
      return;
    }
    navigate(`/analysis/v2/${targetNotebookId}`, {
      replace: false
    });
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleFieldDragEnd} collisionDetection={rectIntersection}>
      <div className="min-h-screen bg-[#eef6fd] analysis-v2-body">
        <div className="max-w-6xl mx-auto px-6 pt-0 pb-8 space-y-8">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="h-12 w-12 mx-auto mb-4 border-4 border-[#b5ece0] border-t-[#06c3a8] rounded-full animate-spin" />
              <p className="text-gray-500">AI 正在读取笔记和字段...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-gray-900">当前笔记本</h2>
                <div className="relative min-w-[220px]" ref={notebookDropdownRef}>
                  <button
                    ref={notebookTriggerRef}
                    type="button"
                    onClick={() => setNotebookDropdownOpen(prev => !prev)}
                    className="w-full flex items-center justify-between rounded-full border border-[#90e2d0] bg-gradient-to-r from-[#eef6fd]/60 to-white px-4 py-1.5 text-xs text-[#0a917a] hover:border-[#6bd8c0]"
                  >
                    <span className="truncate">
                      {notebook ? `${notebook.name}（${notes.length} 条笔记）` : '请选择笔记本'}
                    </span>
                    <svg
                      className={`ml-2 h-3 w-3 flex-shrink-0 transition-transform ${
                        notebookDropdownOpen ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {notebookDropdownOpen && notebookMenuPos &&
                    createPortal(
                      <div
                        ref={notebookMenuRef}
                        className="z-[180] bg-white border-2 border-[#b5ece0] rounded-2xl shadow-xl shadow-[#c4f1e5]"
                        style={{
                          position: 'fixed',
                          top: notebookMenuPos.top,
                          left: notebookMenuPos.left,
                          width: notebookMenuPos.width,
                          maxHeight: '300px',
                          overflowY: 'auto',
                          boxShadow:
                            '0 10px 25px -5px rgba(6, 195, 168, 0.22), 0 0 0 1px rgba(6, 195, 168, 0.12)'
                        }}
                      >
                        <div className="p-2 text-xs">
                          {notebooks.length === 0 ? (
                            <div className="px-4 py-3 text-center text-gray-500">暂无笔记本，请先创建。</div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  handleNotebookChange('');
                                  setNotebookDropdownOpen(false);
                                  setHoveredNotebookId(null);
                                }}
                                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                  !notebookId ? 'bg-[#eef6fd] text-[#0a6154] font-medium' : 'text-gray-900 hover:bg-[#eef6fd]'
                                }`}
                              >
                                <span>请选择笔记本</span>
                              </button>
                              {notebooks.map(nb => {
                              const isSelected = notebookId === nb.notebook_id;
                              const isHovered = hoveredNotebookId === nb.notebook_id;
                              const shouldHighlight = isHovered || (!hoveredNotebookId && isSelected);
                              const noteCount =
                                isSelected && notes.length ? notes.length : nb.note_count || 0;
                              return (
                                <button
                                  key={nb.notebook_id}
                                  type="button"
                                  onClick={() => {
                                    handleNotebookChange(nb.notebook_id);
                                    setNotebookDropdownOpen(false);
                                    setHoveredNotebookId(null);
                                  }}
                                  onMouseEnter={() => setHoveredNotebookId(nb.notebook_id)}
                                  onMouseLeave={() => setHoveredNotebookId(null)}
                                  className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                    shouldHighlight
                                      ? 'bg-[#eef6fd] text-[#0a6154] font-medium'
                                      : 'text-gray-900 hover:bg-[#eef6fd]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span>{nb.name}</span>
                                    <span className="ml-2 text-gray-500" style={{ fontSize: '12px' }}>
                                      ({noteCount}条笔记)
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                            </>
                          )}
                        </div>
                      </div>,
                      document.body
                    )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNoteSettingsExpanded(prev => !prev)}
                className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-[#6bd8c0]"
              >
                {noteSettingsExpanded ? '收起设置 ▴' : '展开设置 ▾'}
              </button>
            </div>

            {noteSettingsExpanded && (
              <section className="rounded-3xl border border-[#d4f3ed] bg-white shadow-sm overflow-hidden">
                <div className="p-6 space-y-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span>起始日期</span>
                        <input
                          type="date"
                          value={noteFilterDateRange.from}
                          onChange={e => handleDateFilterChange({ from: e.target.value })}
                          className="rounded-full border border-gray-200 px-3 py-1.5 text-xs focus:border-[#6bd8c0] focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span>结束日期</span>
                        <input
                          type="date"
                          value={noteFilterDateRange.to}
                          onChange={e => handleDateFilterChange({ to: e.target.value })}
                          className="rounded-full border border-gray-200 px-3 py-1.5 text-xs focus:border-[#6bd8c0] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[#c5f0e4] bg-[#f5fffb]">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#dff7ef] bg-white/60">
                      <div className="text-sm font-semibold text-gray-900">笔记列表</div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>
                          已选择{' '}
                          {notes.filter(note =>
                            selectedNoteIds.includes(String(resolveNoteId(note)))
                          ).length}{' '}
                          条
                        </span>
                        <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded-none border-gray-300 text-[#0a917a] focus:ring-[#43ccb0] disabled:cursor-not-allowed disabled:opacity-50"
                            checked={isAllSelectableNotesChecked}
                            onChange={handleSelectAllNotesToggle}
                            disabled={!selectableNoteIds.length}
                          />
                          <span>全选</span>
                        </label>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-[#e0f4ed]">
                      {notes.length > 0 ? (
                        notes.map(note => {
                          const id = String(resolveNoteId(note));
                          const checked = selectedNoteIds.includes(id);
                          const createdAt = note.created_at || note.updated_at;
                          const mainText = note.title || note.content_text || '未命名笔记';
                          return (
                            <label
                              key={id}
                              className="flex items-start gap-3 px-4 py-3 text-xs text-gray-700 hover:bg-[#f0fffa] cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="mt-1 rounded border-gray-300 text-[#0a917a] focus:ring-[#43ccb0]"
                                checked={checked}
                                onChange={() => handleToggleNoteSelection(id)}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium truncate">{mainText}</span>
                                  {createdAt && (
                                    <span className="text-[11px] text-gray-400 flex-shrink-0">
                                      {String(createdAt).slice(0, 10)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </label>
                          );
                        })
                      ) : (
                        <div className="px-4 py-8 text-center text-xs text-gray-400">当前条件下暂无笔记</div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            <div className="flex items-center justify-between">
              <div className="inline-flex items-center rounded-full border border-[#d4f3ed] bg-white/80 px-4 py-1.5 text-sm font-semibold text-gray-700 shadow-sm">
                图表分析
              </div>
              <button
                type="button"
                onClick={() => setConfigExpanded(prev => !prev)}
                className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-[#6bd8c0]"
              >
                {configExpanded ? '收起配置 ▴' : '展开配置 ▾'}
              </button>
            </div>

            {configExpanded && (
              <section className="relative rounded-3xl border border-[#d4f3ed] bg-white shadow-sm overflow-hidden">
                {isAnalyzing && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-white/80 text-gray-600 text-sm font-medium">
                    {stageMessage || 'AI 正在分析...'}
                  </div>
                )}
                <div
                  ref={columnsContainerRef}
                  className={`relative grid grid-cols-1 divide-y divide-gray-100 lg:grid-cols-3 lg:divide-y-0 lg:divide-x ${isAnalyzing ? 'pointer-events-none opacity-60' : ''}`}
                  style={
                    isDesktop
                      ? {
                          gridTemplateColumns: `${columnWidths[0]}fr ${columnWidths[1]}fr ${columnWidths[2]}fr`
                        }
                      : undefined
                  }
                >
                <div className="p-6">
                  <div className="mb-6">
                    <h3 className="mt-0 text-sm font-semibold text-gray-900">AI 推荐图表</h3>
                    {chartCandidates.length > 0 && (
                      <div className="mt-3" ref={aiCandidateDropdownRef}>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-400">切换图表</span>
                          <button
                            ref={aiCandidateTriggerRef}
                            type="button"
                            onClick={() => setAiCandidateDropdownOpen(v => !v)}
                            className="w-full max-w-[220px] h-[48px] min-h-[48px] px-4 rounded-full border border-[#7ddcc7] flex items-center justify-between gap-2 transition-colors bg-white text-[#0a917a] hover:bg-[#f0fffa] text-[14px] leading-[20px] shadow-sm"
                            aria-label="切换 AI 推荐图表"
                          >
                            <span className="truncate">
                              {(() => {
                                const selected =
                                  chartCandidates.find(c => c.id === selectedCandidateId) || chartCandidates[0];
                                const label = selected ? (CHART_TYPE_LABELS[selected.chartType] || selected.chartType) : '—';
                                return label;
                              })()}
                            </span>
                            <svg
                              className={`w-4 h-4 transition-transform flex-shrink-0 text-[#0a917a] ${aiCandidateDropdownOpen ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>

                        {aiCandidateDropdownOpen && aiCandidateMenuPos && createPortal(
                          <div
                            ref={aiCandidateMenuRef}
                            className="z-[180] bg-white border border-gray-200 rounded-xl shadow-md"
                            style={{
                              position: 'fixed',
                              top: aiCandidateMenuPos.top,
                              left: aiCandidateMenuPos.left,
                              width: aiCandidateMenuPos.width,
                              background: '#ffffff',
                              backgroundImage: 'none',
                              boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 12px 24px rgba(0,0,0,0.08)',
                              filter: 'none'
                            }}
                          >
                            <div className="p-2 max-h-[300px] overflow-y-auto bg-white">
                              {chartCandidates.map(candidate => {
                                const isActive = (selectedCandidateId || chartCandidates[0]?.id) === candidate.id;
                                const label = CHART_TYPE_LABELS[candidate.chartType] || candidate.chartType;
                                const aiTag = candidate.id === defaultCandidateId ? '（AI 推荐）' : '';
                                return (
                                  <button
                                    key={candidate.id}
                                    type="button"
                                    onClick={() => {
                                      handleSelectCandidate(candidate);
                                      setAiCandidateDropdownOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-2 rounded-lg transition-colors mt-1 flex items-center gap-2 text-[14px] leading-[14px] ${
                                      isActive
                                        ? 'bg-[#f0fffa] text-[#0a917a]'
                                        : 'text-gray-900 hover:bg-[#f0fffa]'
                                    }`}
                                  >
                                    <span className={`w-4 text-sm ${isActive ? 'text-[#0a917a]' : 'text-transparent'}`}>✓</span>
                                    <span className="font-medium whitespace-nowrap">
                                      {label}
                                      {aiTag}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>,
                          document.body
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-1">
                    {chartCandidates.length > 0 ? (
                      (() => {
                        const selectedCandidate =
                          chartCandidates.find(candidate => candidate.id === selectedCandidateId) || chartCandidates[0];
                        const selectedTypeLabel =
                          CHART_TYPE_LABELS[selectedCandidate.chartType] || selectedCandidate.chartType;
                        const isApplied = Boolean(
                          chartInstances.find(chart => chart.candidateId === selectedCandidate.id)
                        );

                        return (
                          <div className="flex h-full flex-col rounded-2xl border border-[1.5px] border-[#d4f3ed] bg-white p-4 transition-all">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="flex items-center gap-3">
                                <div className="text-2xl">{selectedCandidate.icon}</div>
                                <div>
                                  <p className="font-semibold text-gray-900">
                                    {selectedTypeLabel}·{selectedCandidate.chartType.toUpperCase()}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <p className="!text-xs text-gray-600 mb-3 leading-relaxed">
                              {selectedCandidate.title}：{selectedCandidate.reason}
                            </p>
                            <p className="text-xs text-gray-400 mb-4">
                              需要字段：{[...selectedCandidate.requiredDimensions, ...selectedCandidate.requiredMetrics].join(', ')}
                            </p>

                            <div className="mt-auto space-y-2">
                              <button
                                type="button"
                                onClick={() => handleSelectCandidate(selectedCandidate)}
                                className={`w-full rounded-2xl px-3 py-2 text-sm font-medium transition-colors ${
                                  isApplied ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-black'
                                }`}
                                disabled={isApplied}
                              >
                                {isApplied ? '已选择' : '选择该图表'}
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[#b5ece0] bg-[#eef6fd]/40 p-6 text-center text-xs text-gray-500">
                        暂无 AI 推荐图表
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="mt-0 text-sm font-semibold text-gray-900">字段表</h3>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomFieldName('');
                          setCustomFieldRole('dimension');
                          setCustomFieldModalOpen(true);
                        }}
                        className="inline-flex items-center rounded-full border border-[#90dfcb] bg-white px-3 py-1.5 text-[12px] text-[#0a917a] hover:bg-[#effdf8] hover:border-[#43ccb0]"
                      >
                        +自定义
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={fieldSearch}
                        onChange={e => setFieldSearch(e.target.value)}
                        placeholder="搜索字段..."
                        className="!w-[112px] rounded-full border border-gray-200 px-3 py-1.5 text-[12px] focus:border-[#6bd8c0] focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="mt-1 space-y-2">
                    {filteredFields.map(field => (
                      <DraggableFieldListItem
                        key={field.id}
                        field={field}
                        onDelete={() => {
                          setPendingDeleteField(field);
                        }}
                      />
                    ))}

                  </div>
                </div>
                <div className="p-6">
                  <h3 className="mt-0 text-sm font-semibold text-gray-900 mb-6">图表配置</h3>
                  {activeChart ? (
                    <div className="mt-1 space-y-6">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          {activeChart.chartType === 'line'
                            ? '时间（X）'
                            : activeChart.chartType === 'pie'
                              ? '分类维度'
                              : activeChart.chartType === 'heatmap'
                                ? '维度一'
                                : '分类（X）'}
                        </h4>
                        <AxisDropZone
                          axisSlot="dimension"
                          candidates={activeChart.dimensionCandidates || []}
                          selectedField={activeChart.selectedDimension}
                          radioGroupName={`dimension-${activeChart.id}`}
                          emptyHint="拖拽字段到此处，创建维度候选"
                          onSelect={handleAxisSelectionChange}
                          onRemove={removeFieldFromAxis}
                        />
                      </div>
                      {activeChart.chartType === 'heatmap' && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">维度二</h4>
                          <AxisDropZone
                            axisSlot="dimension2"
                            candidates={(activeChart as any).dimension2Candidates || []}
                            selectedField={(activeChart as any).selectedDimension2 || null}
                            radioGroupName={`dimension2-${activeChart.id}`}
                            emptyHint="拖拽字段到此处，创建第二维度候选"
                            onSelect={handleAxisSelectionChange}
                            onRemove={removeFieldFromAxis}
                          />
                        </div>
                      )}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          {activeChart.chartType === 'pie'
                            ? '数值 / 数量'
                            : activeChart.chartType === 'heatmap'
                              ? '强度'
                              : '数值（Y）'}
                        </h4>
                        <AxisDropZone
                          axisSlot="metric"
                          candidates={activeChart.metricCandidates || []}
                          selectedField={activeChart.selectedMetric}
                          radioGroupName={`metric-${activeChart.id}`}
                          emptyHint="拖拽字段到此处，创建数值候选"
                          onSelect={handleAxisSelectionChange}
                          onRemove={removeFieldFromAxis}
                        />
                      </div>
                    </div>
                  ) : (
                    null
                  )}
                </div>
                {isDesktop && (
                  <>
                    <div
                      className="pointer-events-auto hidden lg:block absolute top-0 bottom-0 z-10 w-3 cursor-col-resize"
                      style={{
                        left: `${(columnWidths[0] / (columnWidths[0] + columnWidths[1] + columnWidths[2])) * 100}%`,
                        transform: 'translateX(-50%)'
                      }}
                      onMouseDown={event => handleDragStart(event, 0)}
                    >
                      <div className="mx-auto h-full w-[2px] rounded-full bg-transparent hover:bg-[#43ccb0] transition-colors" />
                    </div>
                    <div
                      className="pointer-events-auto hidden lg:block absolute top-0 bottom-0 z-10 w-3 cursor-col-resize"
                      style={{
                        left: `${((columnWidths[0] + columnWidths[1]) / (columnWidths[0] + columnWidths[1] + columnWidths[2])) * 100}%`,
                        transform: 'translateX(-50%)'
                      }}
                      onMouseDown={event => handleDragStart(event, 1)}
                    >
                      <div className="mx-auto h-full w-[2px] rounded-full bg-transparent hover:bg-[#43ccb0] transition-colors" />
                    </div>
                  </>
                )}
              </div>
            </section>
            )}

            <section className="rounded-3xl border border-[#d4f3ed] bg-white shadow-sm overflow-hidden">
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {activeChart ? CHART_TYPE_LABELS[activeChart.chartType] || '图表' : '图表'}
                    </h3>
                  </div>
                </div>
                <div className="space-y-4">
                  {chartInstances.map(chart => (
                    <div
                      key={chart.id}
                      className={`rounded-3xl border border-[1.5px] p-5 shadow-sm bg-white transition-all ${chart.id === activeChartId ? 'border-[#43ccb0] shadow-lg' : 'border-[#d4f3ed]'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                          <p className="text-base font-semibold text-gray-900">{chart.title}</p>
                          <p className="text-sm text-gray-500">{chart.reason}</p>
                          {(() => {
                            const aiType = inferCandidateChartType(chart.candidateId);
                            if (!aiType || aiType === chart.chartType) return null;
                            return (
                              <p className="mt-1 text-xs text-gray-400">
                                已切换为 {CHART_TYPE_LABELS[chart.chartType] || chart.chartType}（AI 推荐：{CHART_TYPE_LABELS[aiType] || aiType}）
                              </p>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={chart.chartType}
                            onChange={event => handleChartTypeChange(chart.id, event.target.value as ChartType)}
                            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-[#6bd8c0] focus:border-[#6bd8c0] focus:outline-none"
                            aria-label="选择图表类型"
                          >
                            {(['line', 'bar', 'pie', 'heatmap', 'area', 'wordcloud'] as ChartType[]).map(t => (
                              <option key={t} value={t}>
                                {CHART_TYPE_LABELS[t] || t}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => setActiveChartId(chart.id)}
                            className={`rounded-full px-3 py-1.5 text-xs ${chart.id === activeChartId ? 'bg-[#06c3a8] text-white' : 'bg-gray-100 text-gray-600'}`}
                          >
                            {chart.id === activeChartId ? '当前图表' : '设为当前'}
                          </button>
                          <button
                            onClick={() => setFieldPanelOpen(true)}
                            className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-[#6bd8c0]"
                          >
                            字段列表
                          </button>
                          <button
                            onClick={() => handleRemoveChart(chart.id)}
                            className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-red-400"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                      <div className="h-[300px]">
                        {renderChartPreview(chart, dataset)}
                      </div>
                    </div>
                  ))}
                  {!chartInstances.length && (
                    <div className="rounded-3xl border border-dashed border-[#b5ece0] bg-[#eef6fd]/40 p-8 text-center text-sm text-gray-500">
                      请选择上方推荐图表加入分析
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="flex items-center justify-between">
              <div className="inline-flex items-center rounded-full border border-[#d4f3ed] bg-white/80 px-4 py-1.5 text-sm font-semibold text-gray-700 shadow-sm">
                AI 分析
              </div>
              <button
                type="button"
                onClick={() => setAiPanelExpanded(prev => !prev)}
                className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-[#6bd8c0]"
              >
                {aiPanelExpanded ? '收起提示 ▴' : '展开提示 ▾'}
              </button>
            </div>

            {aiPanelExpanded && (
              <section className="rounded-3xl border border-[#d4f3ed] bg-white shadow-sm overflow-hidden">
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative inline-flex items-center gap-2">
                      {isEditingAiPrompt ? (
                        <input
                          value={promptTitleDraft}
                          onChange={event => setPromptTitleDraft(event.target.value)}
                          placeholder="请输入 Prompt 标题"
                          className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#43ccb0] focus:border-transparent"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setPromptTitleDropdownOpen(prev => !prev)}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900"
                          >
                            <span>{promptTitle}</span>
                            <svg
                              className={`w-4 h-4 transition-transform ${promptTitleDropdownOpen ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {promptTitleDropdownOpen && (
                            <div className="absolute left-0 top-full mt-2 w-40 rounded-xl border border-[#d4f3ed] bg-white shadow-lg z-20">
                              <div className="max-h-56 overflow-y-auto py-1 text-xs">
                                {promptTemplates.map(template => (
                                  <button
                                    key={template.id}
                                    type="button"
                                    onClick={() => {
                                      setCurrentTemplateId(template.id);
                                      setPromptTitle(template.title);
                                      setPromptTitleDraft(template.title);
                                      setAiPrompt(template.content);
                                      setAiPromptDraft(template.content);
                                      setPromptTitleDropdownOpen(false);
                                      setIsEditingAiPrompt(false);
                                      setEditingTemplateId(null);
                                    }}
                                    className={`flex w-full items-center px-3 py-1.5 text-left ${
                                      currentTemplateId === template.id
                                        ? 'bg-[#eef6fd] text-[#0a6154] font-medium'
                                        : 'text-gray-700 hover:bg-[#f3f4ff]'
                                    }`}
                                  >
                                    {template.title}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTemplateId(null);
                        setPromptTitleDraft('');
                        setAiPromptDraft('');
                        setIsEditingAiPrompt(true);
                        setPromptTitleDropdownOpen(false);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-[#0a917a] bg-[#e8fbf6] rounded-full hover:bg-[#d4f3ed]"
                    >
                      新建 Prompt
                    </button>
                  </div>
                  <div>
                    {isEditingAiPrompt ? (
                      <textarea
                        value={aiPromptDraft}
                        onChange={event => setAiPromptDraft(event.target.value)}
                        rows={8}
                        className="w-full min-h-[160px] rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#43ccb0] focus:border-transparent resize-vertical"
                      />
                    ) : (
                      <div className="w-full min-h-[160px] rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-700 whitespace-pre-wrap">
                        {aiPrompt || '暂未配置提示词内容。'}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-start gap-2">
                    {isEditingAiPrompt ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPromptTitleDraft(promptTitle);
                            setAiPromptDraft(aiPrompt);
                            setIsEditingAiPrompt(false);
                            setEditingTemplateId(null);
                          }}
                          className="px-4 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const finalTitle = (promptTitleDraft || '').trim() || '未命名 Prompt';
                            const finalContent = (aiPromptDraft || '').trim() || aiPrompt;
                            const templateId = editingTemplateId || `template_${Date.now()}`;
                            setPromptTemplates(prev => {
                              const existingIndex = prev.findIndex(t => t.id === templateId);
                              const nextTemplate = { id: templateId, title: finalTitle, content: finalContent };
                              if (existingIndex >= 0) {
                                const copy = [...prev];
                                copy[existingIndex] = nextTemplate;
                                return copy;
                              }
                              return [...prev, nextTemplate];
                            });
                            setCurrentTemplateId(templateId);
                            setPromptTitle(finalTitle);
                            setPromptTitleDraft(finalTitle);
                            setAiPrompt(finalContent);
                            setAiPromptDraft(finalContent);
                            setIsEditingAiPrompt(false);
                            setEditingTemplateId(null);
                          }}
                          className="px-4 py-2 text-xs font-medium text-white bg-[#06c3a8] rounded-full hover:bg-[#04b094]"
                        >
                          保存
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTemplateId(currentTemplateId);
                          setPromptTitleDraft(promptTitle);
                          setAiPromptDraft(aiPrompt);
                          setIsEditingAiPrompt(true);
                          setPromptTitleDropdownOpen(false);
                        }}
                        className="px-4 py-2 text-xs font-medium text-[#0a6154] bg-[#eef6fd] rounded-full hover:bg-[#d4f3ed]"
                      >
                        编辑
                      </button>
                    )}
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-3xl border border-[#e5ddff] bg-white shadow-sm overflow-hidden">
              <div className="p-6 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">笔记分析</h3>
                <div className="min-h-[160px] rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-700 whitespace-pre-wrap">
                  暂无分析结果。
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      {fieldPanelOpen && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/30">
          <div className="h-full w-full max-w-3xl bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">笔记数据</h3>
                <p className="text-sm text-gray-500">
                  管理现有字段和 AI 生成字段，修改会同步到字段表与图表配置。
                </p>
              </div>
              <button
                onClick={() => setFieldPanelOpen(false)}
                className="rounded-full border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:border-[#6bd8c0]"
              >
                关闭
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
                <div className="flex-1 min-w-[220px]">
                  <label className="text-xs text-gray-500 mb-1 block">字段名称</label>
                  <input
                    value={newFieldName}
                    onChange={e => setNewFieldName(e.target.value)}
                    placeholder="例如：情绪强度"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#6bd8c0] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">字段角色</label>
                  <select
                    value={newFieldRole}
                    onChange={e => setNewFieldRole(e.target.value as FieldRole)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#6bd8c0] focus:outline-none"
                  >
                    <option value="dimension">X轴（文本/分类）</option>
                    <option value="metric">Y轴（数字）</option>
                  </select>
                </div>
                <button
                  onClick={handleCreateField}
                  className="rounded-2xl bg-[#06c3a8] px-4 py-2 text-sm text-white hover:bg-[#04b094]"
                >
                  新增字段
                </button>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                <div ref={tableScrollRef} className="overflow-auto">
                  {allFields.length > 0 ? (
                    <table className="min-w-max w-full text-sm border-collapse">
                      <thead>
                        <tr>
                          {allFields.map(field => (
                            <th
                              key={field.id || field.name}
                              className="px-3 py-2 text-left text-gray-700 bg-gray-50 border border-gray-200 whitespace-nowrap"
                            >
                              <div className="flex w-full items-center gap-2">
                                {editingFieldId === field.id ? (
                                  <>
                                    <input
                                      value={editingFieldName}
                                      onChange={e => setEditingFieldName(e.target.value)}
                                      className="rounded border border-gray-200 px-2 py-1 text-xs focus:border-[#6bd8c0] focus:outline-none"
                                    />
                                    <div className="ml-auto flex items-center gap-1">
                                      <button
                                        onClick={handleSaveFieldEdit}
                                        className="rounded-full bg-[#06c3a8] px-2 py-1 text-[11px] text-white hover:bg-[#04b094]"
                                      >
                                        保存
                                      </button>
                                      <button
                                        onClick={cancelEditField}
                                        className="rounded-full border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:border-gray-400"
                                      >
                                        取消
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <span>{field.name}</span>
                                    <div className="ml-auto flex items-center gap-1">
                                      <button
                                        onClick={() => beginEditField(field)}
                                        className="text-xs text-gray-500 hover:text-[#0a917a]"
                                        title="编辑字段"
                                      >
                                        编辑
                                      </button>
                                      <button
                                        onClick={() => setPendingDeleteField(field)}
                                        className="text-xs text-gray-400 hover:text-red-500"
                                        title="删除字段"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {notePreview.length > 0 ? (
                          notePreview.map(note => {
                            const noteId = String(resolveNoteId(note)) || Math.random().toString(36).slice(2, 8);
                            return (
                              <tr key={noteId}>
                                {allFields.map(field => (
                                  <td
                                    key={`${noteId}-${field.name}`}
                                    className="px-3 py-2 text-xs text-gray-700 border border-gray-100 min-w-[96px]"
                                  >
                                    {getNoteFieldValue(note, field) || '—'}
                                  </td>
                                ))}
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={allFields.length} className="px-4 py-6 text-center text-gray-400 border border-gray-100">
                              暂无笔记数据
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  ) : (
                    null
                  )}
                </div>
                {tableScrollState.max > 0 && (
                  <div className="flex items-center gap-3 border-t border-gray-100 bg-gray-50/80 px-4 py-3">
                    <span className="text-xs text-gray-500 whitespace-nowrap">左右滑动</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(tableScrollState.max, 0)}
                      step={1}
                      value={tableScrollState.value}
                      onChange={handleTableSliderChange}
                      className="w-full accent-[#43ccb0]"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {customFieldModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900 text-[14px]">新建自定义字段</h2>
                <p className="text-slate-500 mt-1 text-[12px]">
                  输入字段名称，并选择该字段是作为数值指标还是文本维度。
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!customFieldSubmitting) {
                    setCustomFieldModalOpen(false);
                  }
                }}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 text-[12px]">
              <div className="space-y-2">
                <label className="text-xs text-gray-600">字段名称</label>
                <input
                  type="text"
                  value={customFieldName}
                  onChange={e => setCustomFieldName(e.target.value)}
                  placeholder="例如：专注度"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#43ccb0]"
                  disabled={customFieldSubmitting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-gray-600">字段角色</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomFieldRole('dimension')}
                    className={`flex-1 px-3 py-2 rounded-lg border text-[12px] ${
                      customFieldRole === 'dimension'
                        ? 'border-[#43ccb0] bg-[#eef6fd] text-[#0a6154]'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                    disabled={customFieldSubmitting}
                  >
                    文本/分类（X轴）
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomFieldRole('metric')}
                    className={`flex-1 px-3 py-2 rounded-lg border text-[12px] ${
                      customFieldRole === 'metric'
                        ? 'border-[#43ccb0] bg-[#eef6fd] text-[#0a6154]'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                    disabled={customFieldSubmitting}
                  >
                    数值指标（Y轴）
                  </button>
                </div>
              </div>
            </div>
            <div className="border-t px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!customFieldSubmitting) {
                    setCustomFieldModalOpen(false);
                  }
                }}
                className="px-4 py-2 rounded-lg border border-[#90e2d0] text-slate-700 hover:bg-[#eef6fd] hover:border-[#43ccb0] text-[12px]"
                disabled={customFieldSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreateCustomAiField}
                className="px-4 py-2 rounded-lg bg-[#06c3a8] text-white text-[12px] disabled:opacity-50"
                disabled={customFieldSubmitting}
              >
                {customFieldSubmitting ? '生成中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingDeleteField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 text-[14px]">删除字段</h2>
              <button
                type="button"
                onClick={() => {
                  if (!deleteFieldSubmitting) {
                    setPendingDeleteField(null);
                  }
                }}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-3 text-[12px]">
              <p className="text-slate-800">
                确定要删除字段「{pendingDeleteField.name}」吗？
              </p>
              <p className="text-slate-500 text-[11px]">
                删除后，该字段将从字段表和图表配置中移除，无法恢复。
              </p>
            </div>
            <div className="border-t px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!deleteFieldSubmitting) {
                    setPendingDeleteField(null);
                  }
                }}
                className="px-4 py-2 rounded-lg border border-[#90e2d0] text-slate-700 hover:bg-[#eef6fd] hover:border-[#43ccb0] text-[12px]"
                disabled={deleteFieldSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!pendingDeleteField) return;
                  try {
                    setDeleteFieldSubmitting(true);
                    await handleDeleteField(pendingDeleteField);
                    setPendingDeleteField(null);
                  } finally {
                    setDeleteFieldSubmitting(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-[12px] disabled:opacity-50"
                disabled={deleteFieldSubmitting}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </DndContext>
  );
};

export default AnalysisSettingV2Page;
