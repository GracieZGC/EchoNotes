import { normalizeParseHistoryStatus } from './utils.js';

// 简单判断字符串是否疑似 HTML（例如 Coze 返回了登录页）
export const looksLikeHtml = (text = '') => {
  if (!text || typeof text !== 'string') return false;
  const preview = text.trim().slice(0, 400).toLowerCase();
  return (
    preview.includes('<!doctype') ||
    preview.includes('<html') ||
    preview.includes('<body') ||
    (preview.includes('coze') && (preview.includes('登录') || preview.includes('login')))
  );
};

// 判定请求是否因超时/中断而终止
export const isAbortError = (err) => {
  const msg = (err?.message || '').toLowerCase();
  const abortCodes = ['ECONNABORTED', 'ECONNRESET', 'EPIPE'];
  return (
    abortCodes.includes(err?.code) ||
    msg.includes('aborted') ||
    msg.includes('timeout') ||
    msg.includes('socket hang up') ||
    msg.includes('connection reset')
  );
};

// 简单从正文中推断标题/作者/时间
export const deriveMetaFromContent = (content = '') => {
  const lines = (content || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const dateRegex =
    /(\d{4}[./-]\d{1,2}[./-]\d{1,2}(?:[ T]?\d{1,2}:\d{2}(?::\d{2})?)?|\d{1,2}[./-]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)/;
  const result = { title: null, author: null, published_at: null };
  if (lines.length > 0) {
    const first = lines[0];
    const m = first.match(dateRegex);
    // 如果第一行以日期开头，去掉日期部分作为标题
    if (m && m.index === 0) {
      const stripped = first.replace(dateRegex, '').trim();
      result.title = stripped || first;
    } else {
      result.title = first;
    }
  }
  if (lines.length > 1 && lines[1].length <= 20) {
    result.author = lines[1];
  }
  // 找包含日期/时间的行，优先最短匹配
  const dateLines = lines
    .map((l) => {
      const m = l.match(dateRegex);
      return m ? { line: l, match: m[1] || m[0], length: (m[1] || m[0]).length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);
  if (dateLines.length > 0) {
    result.published_at = dateLines[0].match;
  }
  return result;
};

// 清洗摘要：去掉开头客套话、去除粗体符号等 Markdown 噪点
export const sanitizeSummary = (summary = '') => {
  if (!summary || typeof summary !== 'string') return '';
  let cleaned = summary.trim();
  cleaned = cleaned.replace(/^好(的|吧)?，?这?是?为?您?整理的[:：]?\s*/i, '');
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  return cleaned.trim();
};

// 清洗 Coze 文本里的工具调用/客套话
export const cleanParsedContentText = (text = '') => {
  if (!text || typeof text !== 'string') return text;
  const lines = text.split('\n');
  const filtered = lines.filter((line) => {
    let original = line || '';
    let t = original.trim().toLowerCase();
    if (!t) return true; // 保留空行
    const killPrefixes = [
      '调用',
      'ts-extract_link',
      '用户需要解析链接文章内容',
      '用户需要解析文章链接的内容',
      '我来帮您解析这个链接的文章内容',
      '让我先提取链接中的信息',
      '正在提取链接文章内容',
      '正在提取链接'
    ];
    // 整行噪声直接丢弃
    if (killPrefixes.some((p) => t.startsWith(p))) return false;
    // 行内包含工具/提示语也直接丢弃
    const killContains = [
      'ts-extract_link',
      'extract_link',
      '调用 ts-extract',
      '调用ts-extract',
      '调用  ts-extract',
      '调用 ts-extract_link',
      '解析链接文章内容',
      '解析文章链接的内容',
      '解析文章内容'
    ];
    if (killContains.some((p) => t.includes(p))) return false;
    // 句中包含的提示语去除后保留其余文本
    const stripPhrases = [
      '调用 ts-extract_link-extract_link 函数提取链接文章的主要内容。',
      '调用 ts-extract_link 函数提取链接文章的主要内容。',
      '调用 ts-extract_link',
      '调用  ts-extract_link',
      '用户需要解析链接文章内容，调用 ts-extract_link-extract_link 函数完成解析。',
      '用户需要解析链接文章内容，调用 ts-extract_link 函数完成解析。',
      '用户需要解析文章链接的内容，调用 ts-extract_link-extract_link 函数进行文章解析。',
      '用户需要解析文章链接的内容，调用 ts-extract_link 函数进行文章解析。',
      '用户需要解析链接文章内容，调用 ts-extract_link-extract_link 函数获取文章的文本和图片信息。',
      '用户需要解析链接文章内容，调用 ts-extract_link 函数获取文章的文本和图片信息。'
    ];
    stripPhrases.forEach((phrase) => {
      if (original.includes(phrase)) {
        original = original.replace(phrase, '');
        t = original.trim().toLowerCase();
      }
    });
    // 进一步粗暴过滤：如果行里同时包含 "解析" 和 "ts-extract" 或 "extract_link"，直接丢弃
    if (t.includes('解析') && (t.includes('ts-extract') || t.includes('extract_link'))) return false;
    // 若清理后为空则丢弃
    if (!t) return false;
    return true;
  });
  return filtered.join('\n').trim();
};

// 判断内容是否仅包含工具调用（未返回正文）
export const isToolCallOnlyPayload = (value) => {
  if (!value) return false;
  let text = '';
  if (typeof value === 'string') {
    text = value.trim();
  } else if (typeof value === 'object') {
    try {
      text = JSON.stringify(value);
    } catch (e) {
      return false;
    }
  }
  if (!text.startsWith('{')) return false;
  try {
    const obj = typeof value === 'object' ? value : JSON.parse(text);
    if (!obj || typeof obj !== 'object') return false;
    const hasToolShape =
      !!obj.name &&
      typeof obj.name === 'string' &&
      obj.parameters &&
      typeof obj.parameters === 'object' &&
      obj.parameters.input &&
      typeof obj.parameters.input === 'string';
    const hasContentFields =
      !!obj.content ||
      !!obj.answer ||
      !!obj.result ||
      !!obj.text ||
      !!obj.body;
    return hasToolShape && !hasContentFields;
  } catch (e) {
    return false;
  }
};

// 清洗提取到的字段，去掉工具调用/客套话
export const sanitizeExtractedFields = (fields = {}) => {
  if (!fields || typeof fields !== 'object') return fields;
  const clone = { ...fields };
  const cleanValue = (val) => {
    if (typeof val === 'string') return cleanParsedContentText(val);
    if (Array.isArray(val)) return val.map((v) => cleanValue(v));
    return val;
  };
  ['title', 'content', 'summary', 'body', 'text'].forEach((key) => {
    if (clone[key]) clone[key] = cleanValue(clone[key]);
  });
  return clone;
};

// 将日期格式化为与 published_at 一致的样式：YYYY/M/D HH:mm:ss
const formatToPublishedStyle = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '';
  }
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

// 统一字段规范化：无论 Coze 返回 JSON 还是纯文本，都产出完整键集
export const normalizeParsedFields = ({
  extractedFields = {},
  fallbackContent = '',
  fallbackSummary = '',
  articleUrl = '',
  createdAt = ''
}) => {
  // 平台推断：优先结构化字段，其次域名
  const inferSourcePlatform = (explicitPlatform, url) => {
    if (explicitPlatform && explicitPlatform.trim()) return explicitPlatform.trim();
    let host = '';
    try {
      host = new URL(url).hostname || '';
    } catch (e) {
      host = '';
    }
    const h = host.toLowerCase();
    if (!h) return '';
    if (h.includes('weixin')) return '微信公众号';
    if (h.includes('douyin') || h.includes('tiktok')) return '抖音';
    if (h.includes('xiaohongshu')) return '小红书';
    if (h.includes('longbridge')) return '长桥';
    if (h.includes('wallstreetcn')) return '华尔街见闻';
    if (h.includes('cailianpress')) return '财联社';
    if (h.includes('caixin')) return '财新';
    return host;
  };

  // 简单的笔记类型推断：优先结构化字段，其次根据域名/标题猜测
  const inferNoteType = (explicitType, sourcePlatform, url, title) => {
    if (explicitType && explicitType.trim()) return explicitType.trim();
    const safeTitle = (title || '').toLowerCase();
    const safePlatform = (sourcePlatform || '').toLowerCase();
    let host = '';
    try {
      host = new URL(url).hostname || '';
    } catch (e) {
      host = '';
    }
    const safeHost = host.toLowerCase();

    // 平台/域名优先判断
    if (
      safeHost.includes('wallstreetcn') ||
      safeHost.includes('cailianpress') ||
      safeHost.includes('caixin') ||
      safeHost.includes('finance')
    ) {
      return '财经分析';
    }
    if (safePlatform.includes('财经')) return '财经分析';
    if (safeHost.includes('weixin')) return '公众号文章';
    if (safeHost.includes('xiaohongshu')) return '生活笔记';
    if (safeHost.includes('douyin') || safeHost.includes('tiktok')) return '短视频笔记';

    // 标题关键词兜底
    const financeKeywords = ['美联储', '降息', '加息', '股市', 'a股', '基金', 'etf', '央行', '经济', '通胀', '利率'];
    if (financeKeywords.some((k) => safeTitle.includes(k.toLowerCase()))) {
      return '财经分析';
    }
    return '';
  };

  // 如果传入的是纯文本字符串，视为正文内容包裹成对象
  if (typeof extractedFields === 'string') {
    extractedFields = { content: extractedFields };
  }
  const ensuredFields = sanitizeExtractedFields(extractedFields || {});
  const nowIso = new Date().toISOString();
  const pickString = (...values) => {
    for (const v of values) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };
  const pickArray = (value) => {
    if (Array.isArray(value)) {
      return value
        .map((v) => (typeof v === 'string' ? v.trim() : String(v || '').trim()))
        .filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return [];
  };
  const deriveKeywords = (title = '', contentText = '') => {
    const text = `${title} ${contentText}`.toLowerCase();
    if (!text.trim()) return [];
    const tokens = text
      .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
      .filter((t) => t && t.length >= 2 && /[a-zA-Z\u4e00-\u9fa5]/.test(t)); // 去掉纯数字
    const freq = {};
    tokens.forEach((t) => {
      freq[t] = (freq[t] || 0) + 1;
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((e) => e[0]);
  };

  const content = pickString(
    ensuredFields.content,
    ensuredFields.body,
    ensuredFields.text,
    fallbackContent
  );
  const summary = sanitizeSummary(pickString(ensuredFields.summary, fallbackSummary));
  const derived = deriveMetaFromContent(content);
  const noteTypeFinal = inferNoteType(
    pickString(ensuredFields.note_type, ensuredFields.noteType),
    pickString(ensuredFields.source_platform, ensuredFields.platform),
    articleUrl,
    derived.title || pickString(ensuredFields.title)
  );
  const sourcePlatformFinal = inferSourcePlatform(
    pickString(ensuredFields.source_platform, ensuredFields.platform),
    articleUrl
  );
  const rawPublishedAt = pickString(
    ensuredFields.published_at,
    ensuredFields.publishedAt,
    ensuredFields.publish_time,
    derived.published_at
  );
  const formattedPublishedAt = formatToPublishedStyle(rawPublishedAt);
  const rawNoteCreated = pickString(ensuredFields.note_created_at, createdAt) || nowIso;
  const formattedNoteCreated = formatToPublishedStyle(rawNoteCreated) || formatToPublishedStyle(nowIso);

  const normalized = {
    title: pickString(ensuredFields.title, derived.title),
    content,
    summary,
    published_at: formattedPublishedAt || rawPublishedAt,
    note_created_at: formattedNoteCreated,
    author: pickString(ensuredFields.author, derived.author),
    link: pickString(ensuredFields.link, ensuredFields.url, ensuredFields.source_url, articleUrl),
    img_urls: pickArray(ensuredFields.img_urls || ensuredFields.image_urls || ensuredFields.images),
    source_platform: sourcePlatformFinal,
    note_type: noteTypeFinal,
    keywords:
      pickArray(ensuredFields.keywords || ensuredFields.tags).length > 0
        ? pickArray(ensuredFields.keywords || ensuredFields.tags)
        : deriveKeywords(pickString(ensuredFields.title, derived.title), content)
  };

  return {
    ...normalized,
    status: normalized.content ? normalizeParseHistoryStatus('completed') : normalizeParseHistoryStatus('failed')
  };
};
