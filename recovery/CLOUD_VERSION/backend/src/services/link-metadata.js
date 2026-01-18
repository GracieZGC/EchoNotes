import axios from 'axios';

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9'
};

const getFinalUrlFromAxiosResponse = (resp) =>
  resp?.request?.res?.responseUrl || resp?.config?.url || '';

const decodeHtml = (input = '') =>
  String(input)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const escapeRegExp = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractMeta = (html, key) => {
  if (!html) return '';
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=[\"']${escapeRegExp(key)}[\"'][^>]+content=[\"'](.*?)[\"']`,
    'i'
  );
  const m = String(html).match(re);
  return m && m[1] ? decodeHtml(m[1]).trim() : '';
};

const extractTitleTag = (html) => {
  const m = String(html || '').match(/<title[^>]*>(.*?)<\/title>/is);
  return m && m[1] ? decodeHtml(m[1]).trim() : '';
};

export const fetchLinkMetadata = async (url, options = {}) => {
  const inputUrl = String(url || '').trim();
  if (!inputUrl) throw new Error('缺少 URL');

  let parsed;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new Error('URL 不合法');
  }

  const timeoutMs = Number(options.timeoutMs || 15000);
  const headers = { ...DEFAULT_HEADERS, ...(options.headers || {}) };

  const resp = await axios.get(parsed.toString(), {
    headers,
    timeout: timeoutMs,
    maxRedirects: 6,
    responseType: 'text',
    validateStatus: (s) => s >= 200 && s < 500
  });

  const finalUrl = getFinalUrlFromAxiosResponse(resp) || parsed.toString();
  const html = typeof resp.data === 'string' ? resp.data : '';

  const ogTitle = extractMeta(html, 'og:title');
  const twitterTitle = extractMeta(html, 'twitter:title');
  const titleTag = extractTitleTag(html);
  const title = ogTitle || twitterTitle || titleTag;

  const ogDesc = extractMeta(html, 'og:description');
  const desc = extractMeta(html, 'description');
  const description = ogDesc || desc;

  const ogImage = extractMeta(html, 'og:image');
  const twitterImage = extractMeta(html, 'twitter:image');
  const imageUrl = ogImage || twitterImage;

  return {
    inputUrl: parsed.toString(),
    finalUrl,
    status: resp.status,
    title,
    description,
    imageUrl
  };
};

