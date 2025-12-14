import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
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
type FieldSource = 'notebook' | 'system' | 'ai-temp';
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
  dimensions: string[];
  metrics: string[];
  filters: string[];
  createdAt: number;
}

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

const buildAnalysisDataset = (
  notes: Note[],
  aiValues?: Record<string, Record<string, any>>
): AnalysisDatum[] => {
  if (!Array.isArray(notes)) return [];
  return notes.map((note, index) => {
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
};

const buildSystemFields = (dataset: AnalysisDatum[]): FieldDefinition[] => {
  if (!dataset.length) return [];
  const first = dataset[0];
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
      name: '情绪分数',
      role: 'metric',
      dataType: 'number',
      source: 'system',
      description: 'AI 根据文本推测的情绪分值（1-10）',
      sampleValue: String(first.情绪分数)
    },
    {
      id: 'field-mood-category',
      name: '情绪类别',
      role: 'dimension',
      dataType: 'category',
      source: 'system',
      description: '以情绪分数区分的正向/中性/负向标签',
      sampleValue: first.情绪类别
    },
    {
      id: 'field-mood-source',
      name: '情绪来源',
      role: 'dimension',
      dataType: 'category',
      source: 'system',
      description: '根据文本提取的情绪来源（工作、朋友等）',
      sampleValue: first.情绪来源
    },
    {
      id: 'field-keywords',
      name: '情绪关键词',
      role: 'dimension',
      dataType: 'text',
      source: 'system',
      description: '高频关键词集合，可用于词云或过滤',
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
      typeof rawValue === 'number'
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
    value: Number((item.value / (item.count || 1)).toFixed(2))
  }));
};

const generateChartCandidates = (fields: FieldDefinition[], dataset: AnalysisDatum[]): ChartCandidate[] => {
  if (!fields.length || !dataset.length) return [];
  const dimensionFields = fields.filter(field => field.role === 'dimension');
  const metricFields = fields.filter(field => field.role === 'metric');
  if (!dimensionFields.length || !metricFields.length) return [];

  const dateDimensions = dimensionFields.filter(field => field.dataType === 'date');
  const categoryDimensions = dimensionFields.filter(
    field => field.dataType === 'category' || field.dataType === 'text'
  );
  const topMetrics = metricFields.slice(0, 3);
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
    if (!dimensionsRequired.length || !metricsRequired.length) return;
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
              : chartType === 'area'
                ? AreaChartIcon
                : chartType === 'heatmap'
                  ? HeatmapIcon
                  : WordcloudIcon,
      reason,
      requiredDimensions: dimensionsRequired,
      requiredMetrics: metricsRequired
    });
  };

  // 趋势类：优先使用日期维度
  if (dateDimensions.length) {
    dateDimensions.slice(0, 2).forEach(dim => {
      topMetrics.forEach(metric => {
        pushCandidate(
          `trend-${dim.name}-${metric.name}`,
          `${metric.name}趋势`,
          'line',
          `跟踪 ${metric.name} 在 ${dim.name} 上的变化`,
          [dim.name],
          [metric.name]
        );
      });
    });
  }

  // 分类对比类
  if (categoryDimensions.length) {
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
    pushCandidate(
      `distribution-${pieDim.name}-${pieMetric.name}`,
      `${pieDim.name}占比`,
      'pie',
      `查看各 ${pieDim.name} 对 ${pieMetric.name} 的贡献`,
      [pieDim.name],
      [pieMetric.name]
    );
  }

  // 多指标趋势
  if (dateDimensions.length && metricFields.length > 1) {
    const dim = dateDimensions[0];
    const metricPair = metricFields.slice(0, 2);
    pushCandidate(
      `multi-${dim.name}-${metricPair.map(metric => metric.name).join('-')}`,
      `${dim.name}多指标曲线`,
      'area',
      `在同一时间轴上比较 ${metricPair.map(metric => metric.name).join('、')} 的走势`,
      [dim.name],
      metricPair.map(metric => metric.name)
    );
  }

  // 日期 + 分类 + 指标 => 热力图
  if (dateDimensions.length && categoryDimensions.length && metricFields.length) {
    const dimDate = dateDimensions[0];
    const dimCategory = categoryDimensions[0];
    const metric = metricFields[0];
    pushCandidate(
      `heatmap-${dimDate.name}-${dimCategory.name}`,
      `${dimCategory.name}·${dimDate.name}热力图`,
      'heatmap',
      `观察 ${dimCategory.name} 在 ${dimDate.name} 维度上的表现强度`,
      [dimDate.name, dimCategory.name],
      [metric.name]
    );
  }

  if (!candidates.length) {
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

  const [dimension] = chart.dimensions;
  const [metric] = chart.metrics;

  if (!dimension || !metric) {
    return <div className="text-sm text-gray-500">请先勾选维度和指标</div>;
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
    const sorted = [...dataset]
      .sort((a, b) => a.日期原始.getTime() - b.日期原始.getTime())
      .map(item => ({
        label: item[dimension],
        value: item[metric]
      }));
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

  const sorted = [...dataset]
    .sort((a, b) => a.日期原始.getTime() - b.日期原始.getTime())
    .map(item => ({
      label: item[dimension],
      value: item[metric]
    }));

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
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [notes, setNotes] = useState<Array<Note & Record<string, any>>>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [aiFields, setAiFields] = useState<FieldDefinition[]>([]);
  const [dataset, setDataset] = useState<AnalysisDatum[]>([]);
  const [chartCandidates, setChartCandidates] = useState<ChartCandidate[]>([]);
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
  const columnsContainerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    handleIndex: 0 | 1;
    startX: number;
    startWidths: [number, number, number];
    containerWidth: number;
  } | null>(null);

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
    };

    if (notebookDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [notebookDropdownOpen]);

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

      if (field.source === 'system') {
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
      setNotebook(null);
      setNotes([]);
      setFields([]);
      setAiFields([]);
      setDataset([]);
      setChartCandidates([]);
      setChartInstances([]);
      setActiveChartId(null);
      setAnalysisStatus('idle');
      return;
    }
    setLoading(true);
    setError(null);
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
        setChartInstances([]);
        setActiveChartId(null);
        setBootstrapped(false);
        setAnalysisStatus('idle');
        return;
      }
      setAnalysisStatus('analyzing');

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

      // 向后端请求 AI 字段（增量补齐）
      let aiFieldValues: Record<string, Record<string, any>> | undefined;
      try {
        const noteIdsForAI = analysisNotes
          .map(note => String(resolveNoteId(note)))
          .filter(Boolean);
        if (noteIdsForAI.length && notebookId) {
          const response = await apiClient.post(`/api/notebooks/${notebookId}/ai-fields`, {
            noteIds: noteIdsForAI,
            fieldKeys: ['mood_score', 'mood_category', 'mood_source', 'mood_keywords'],
            promptTemplateId: currentTemplateId
          });
          const payload = response.data?.data || response.data;
          if (payload?.values && typeof payload.values === 'object') {
            aiFieldValues = payload.values as Record<string, Record<string, any>>;
          }
        }
      } catch (aiError) {
        console.warn('[AnalysisSettingV2] 获取 AI 字段失败，将使用前端推断值:', aiError);
      }

      const generatedDataset = buildAnalysisDataset(analysisNotes, aiFieldValues);
      generatedDataset.sort((a, b) => a.日期原始.getTime() - b.日期原始.getTime());

      const systemFields = buildSystemFields(generatedDataset).filter(
        field => !existingFields.some(item => item.name === field.name)
      );

      setFields([...existingFields, ...systemFields]);
      setAiFields([]);
      setDataset(generatedDataset);

      const candidates = generateChartCandidates([...existingFields, ...systemFields], generatedDataset);
      setChartCandidates(candidates);
      setChartInstances([]);
      setActiveChartId(null);
      setBootstrapped(false);
      setAnalysisStatus('ready');
    } catch (fetchError: any) {
      console.error('加载分析数据失败', fetchError);
      setError(fetchError.message || '加载分析数据失败');
      setAnalysisStatus('idle');
    } finally {
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
      const newChart: ChartInstance = {
        id: `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        candidateId: candidate.id,
        title: candidate.title,
        chartType: candidate.chartType,
        reason: candidate.reason,
        dimensions: ensured.dimensions,
        metrics: ensured.metrics,
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
    if (!bootstrapped && chartCandidates.length > 0 && chartInstances.length === 0) {
      handleAddChart(chartCandidates[0], true);
      setBootstrapped(true);
    }
  }, [chartCandidates, chartInstances.length, bootstrapped, handleAddChart]);

  const handleToggleField = (fieldName: string, role: FieldRole) => {
    if (!activeChart) return;
    setChartInstances(prev =>
      prev.map(chart => {
        if (chart.id !== activeChart.id) return chart;
        const targetKey = role === 'dimension' ? 'dimensions' : 'metrics';
        const exists = chart[targetKey].includes(fieldName);
        const updated = exists
          ? chart[targetKey].filter(item => item !== fieldName)
          : [...chart[targetKey], fieldName];
        return {
          ...chart,
          [targetKey]: updated
        };
      })
    );
  };

  const removeFieldFromCharts = useCallback((fieldName: string) => {
    setChartInstances(prev =>
      prev.map(chart => ({
        ...chart,
        dimensions: chart.dimensions.filter(field => field !== fieldName),
        metrics: chart.metrics.filter(field => field !== fieldName)
      }))
    );
  }, []);

  const replaceFieldInCharts = useCallback((oldName: string, newName: string) => {
    if (oldName === newName) return;
    setChartInstances(prev =>
      prev.map(chart => ({
        ...chart,
        dimensions: chart.dimensions.map(field => (field === oldName ? newName : field)),
        metrics: chart.metrics.map(field => (field === oldName ? newName : field))
      }))
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
      if (targetField.source === 'ai-temp') {
        setAiFields(prev => prev.map(field => (
          field.id === editingFieldId ? { ...field, name: nextName } : field
        )));
        return;
      }
      setFields(prev => prev.map(field => (
        field.id === editingFieldId ? { ...field, name: nextName } : field
      )));
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

    if (field.source === 'ai-temp') {
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

  const handleToggleNoteSelection = (noteId: string) => {
    const id = String(noteId);
    setSelectedNoteIds(prev =>
      prev.includes(id) ? prev.filter(existing => existing !== id) : [...prev, id]
    );
  };

  const handleSelectAllNotesToggle = () => {
    if (!notes.length) return;
    const allIds = notes
      .map(note => String(resolveNoteId(note)))
      .filter(Boolean);
    const isAllSelected = allIds.length > 0 && allIds.every(id => selectedNoteIds.includes(id));
    if (isAllSelected) {
      setSelectedNoteIds(prev => prev.filter(id => !allIds.includes(id)));
    } else {
      setSelectedNoteIds(prev => {
        const set = new Set(prev);
        allIds.forEach(id => set.add(id));
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
    <div className="min-h-screen bg-[#eef6fd] analysis-v2-body">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {/* 顶部标题文案已移除 */}
          </div>
          <div className="flex items-center gap-3" />
        </header>

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
            <section className="rounded-3xl border border-[#d4f3ed] bg-white shadow-sm overflow-hidden">
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold text-gray-900">选择笔记本与笔记范围</h2>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4">
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
                              '0 10px 25px -5px rgba(139, 92, 246, 0.2), 0 0 0 1px rgba(139, 92, 246, 0.1)'
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
                <div className="rounded-2xl border border-[#e5ddff] bg-[#fafbff]">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#ebe9ff]">
                    <div className="text-sm font-medium text-gray-900">笔记列表</div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>
                        已选择{' '}
                        {notes.filter(note =>
                          selectedNoteIds.includes(String(resolveNoteId(note)))
                        ).length}{' '}
                        条
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectAllNotesToggle}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:border-[#6bd8c0]"
                      >
                        全选 / 取消全选
                      </button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                    {notes.length > 0 ? (
                      notes.map(note => {
                        const id = String(resolveNoteId(note));
                        const checked = selectedNoteIds.includes(id);
                        const createdAt = note.created_at || note.updated_at;
                        const mainText = note.title || note.content_text || '未命名笔记';
                        return (
                          <label
                            key={id}
                            className="flex items-start gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-white cursor-pointer"
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

            <div className="flex items-center justify-between">
              <div className="inline-flex items-center rounded-full border border-[#d4f3ed] bg-white/80 px-4 py-1.5 text-xs font-medium text-gray-700 shadow-sm">
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
                    AI 正在分析...
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
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">AI 推荐图表</h2>
                    <p className="text-sm text-gray-500">
                      {isAnalyzing
                        ? 'AI 正在分析所选笔记，请稍候...'
                        : 'AI 先理解笔记字段，推荐最适合的图表。默认自动选中第一个候选，可继续添加更多分析卡片。'}
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                    {chartCandidates.map(candidate => {
                      const isActive = candidate.id === activeCandidateId;
                      const candidateChartInstance = chartInstances.find(chart => chart.candidateId === candidate.id);
                      const alreadyAdded = Boolean(candidateChartInstance);
                      const isDefaultSelected = alreadyAdded && defaultCandidateId === candidate.id;
                      const chartTypeLabel = CHART_TYPE_LABELS[candidate.chartType] || candidate.chartType;
                      return (
                        <div
                          key={candidate.id}
                          className={`flex h-full flex-col rounded-2xl border p-4 transition-all ${isActive ? 'border-[#43ccb0] bg-[#eef6fd] shadow-lg' : 'border-gray-100 bg-white'}`}
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div className="text-2xl">{candidate.icon}</div>
                            <div>
                              <p className="font-semibold text-gray-900">
                                {chartTypeLabel}·{candidate.chartType.toUpperCase()}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mb-3 leading-relaxed">
                            {candidate.title}：{candidate.reason}
                          </p>
                          <p className="text-xs text-gray-400 mb-4">
                            需要字段：{[...candidate.requiredDimensions, ...candidate.requiredMetrics].join(', ')}
                          </p>
                          <div className="mt-auto space-y-2">
                            <button
                              disabled={alreadyAdded}
                              onClick={() => handleAddChart(candidate)}
                              className={`w-full rounded-2xl px-3 py-2 text-sm font-medium transition-colors ${alreadyAdded ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-black'}`}
                            >
                              {isDefaultSelected ? '已选择' : alreadyAdded ? '已加入分析' : '加入分析'}
                            </button>
                            {isDefaultSelected && candidateChartInstance && (
                              <button
                                onClick={() => handleRemoveChart(candidateChartInstance.id)}
                                className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:border-red-300 hover:text-red-500 transition-colors"
                              >
                                取消选择
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">字段表</h3>
                      <p className="text-sm text-gray-500">
                        显示现有字段与 AI 推荐字段，供快速勾选维度/指标。
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={fieldSearch}
                        onChange={e => setFieldSearch(e.target.value)}
                        placeholder="搜索字段..."
                        className="rounded-full border border-gray-200 px-3 py-1.5 text-sm focus:border-[#6bd8c0] focus:outline-none"
                      />
                      <button
                        onClick={() => setFieldPanelOpen(true)}
                        className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:border-[#6bd8c0]"
                      >
                        Excel 字段表
                      </button>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-gray-100">
                    <table className="min-w-full divide-y divide-gray-100 text-sm table-auto">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium w-1/3">字段名称</th>
                          <th className="px-4 py-2 text-left font-medium w-1/6">来源</th>
                          <th className="px-4 py-2 text-left font-medium w-32">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-xs">
                        {filteredFields.map(field => (
                          <tr key={field.id}>
                            <td className="px-4 py-2">
                              <div className="flex flex-col">
                                <span className="font-medium text-gray-900">{field.name}</span>
                                {field.source === 'ai-temp' && (
                                  <span className="text-xs text-[#0a917a]">AI 暂存字段</span>
                                )}
                                {field.description && (
                                  <span className="text-xs text-gray-400">{field.description}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                              {field.source === 'notebook' && '现有字段'}
                              {field.source === 'system' && 'AI推荐'}
                              {field.source === 'ai-temp' && 'AI 生成'}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => beginEditField(field)}
                                  className="rounded-full border border-gray-200 px-2 py-1 text-[11px] text-gray-700 hover:border-[#6bd8c0]"
                                >
                                  编辑
                                </button>
                                {editingFieldId === field.id ? (
                                  <button
                                    onClick={cancelEditField}
                                    className="rounded-full border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:border-gray-400"
                                  >
                                    取消
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleDeleteField(field)}
                                    className="rounded-full border border-gray-200 px-2 py-1 text-[11px] text-red-500 hover:border-red-300"
                                  >
                                    删除
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!filteredFields.length && (
                          <tr>
                            <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                              暂无字段
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">维度 / 指标</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    AI 已根据图表需求自动勾选合适字段，可按需增删。
                  </p>
                  {activeChart ? (
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">维度</h4>
                        <div className="space-y-2">
                          {allFields
                            .filter(field => field.role === 'dimension')
                            .map(field => (
                              <label key={field.id} className="flex items-center gap-3 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={activeChart.dimensions.includes(field.name)}
                                  onChange={() => handleToggleField(field.name, 'dimension')}
                                  className="rounded border-gray-300 text-[#0a917a] focus:ring-[#43ccb0]"
                                />
                                <span>{field.name}</span>
                                {field.source === 'ai-temp' && <span className="text-xs text-[#0a917a]">AI</span>}
                              </label>
                            ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">指标</h4>
                        <div className="space-y-2">
                          {allFields
                            .filter(field => field.role === 'metric')
                            .map(field => (
                              <label key={field.id} className="flex items-center gap-3 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={activeChart.metrics.includes(field.name)}
                                  onChange={() => handleToggleField(field.name, 'metric')}
                                  className="rounded border-gray-300 text-[#0a917a] focus:ring-[#43ccb0]"
                                />
                                <span>{field.name}</span>
                                {field.source === 'ai-temp' && <span className="text-xs text-[#0a917a]">AI</span>}
                              </label>
                            ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">请先选择或添加图表</p>
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
                    <h3 className="text-lg font-semibold text-gray-900">分析画布</h3>
                    <p className="text-sm text-gray-500">
                      默认生成一张最佳图表，可继续把推荐的图表加入画布。
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  {chartInstances.map(chart => (
                    <div
                      key={chart.id}
                      className={`rounded-3xl border p-5 shadow-sm bg-white transition-all ${chart.id === activeChartId ? 'border-[#43ccb0] shadow-lg' : 'border-gray-100'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                          <p className="text-base font-semibold text-gray-900">{chart.title}</p>
                          <p className="text-sm text-gray-500">{chart.reason}</p>
                        </div>
                        <div className="flex items-center gap-2">
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
              <div className="inline-flex items-center rounded-full border border-[#d4f3ed] bg-white/80 px-4 py-1.5 text-xs font-medium text-gray-700 shadow-sm">
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
              <section className="rounded-3xl border border-[#e5ddff] bg-white shadow-sm overflow-hidden">
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
                      className="px-3 py-1.5 text-xs font-medium text-[#7c3aed] bg-[#f5f3ff] rounded-full hover:bg-[#ede9fe]"
                    >
                      新建 Prompt
                    </button>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">提示词内容（手动选择）</p>
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
                <h3 className="text-lg font-semibold text-gray-900">AI 分析结果</h3>
                <p className="text-xs text-gray-500">
                  AI 对所选图表和字段的总结、洞察和建议会展示在这里。
                </p>
                <div className="min-h-[160px] rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-700 whitespace-pre-wrap">
                  暂无分析结果。后续接入 AI 接口后，在这里渲染返回的内容。
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
                    <option value="dimension">维度（文本/分类）</option>
                    <option value="metric">指标（数字）</option>
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
                                        onClick={() => handleDeleteField(field)}
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
                    <div className="py-10 text-center text-gray-400 text-sm">暂无字段</div>
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
    </div>
  );
};

export default AnalysisSettingV2Page;
