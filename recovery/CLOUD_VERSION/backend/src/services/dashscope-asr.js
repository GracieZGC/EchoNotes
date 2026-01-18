import axios from 'axios';

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const transcribeDashscopeFromUrl = async ({
  apiKey,
  mediaUrl,
  model = 'paraformer-v2',
  languageHints = ['zh', 'en'],
  maxWaitMs = 180000
}) => {
  const key = String(apiKey || '').trim();
  const url = String(mediaUrl || '').trim();
  if (!key) throw new Error('未配置 DASHSCOPE_API_KEY');
  if (!url) throw new Error('缺少 mediaUrl');

  const submitResp = await axios.post(
    `${DEFAULT_BASE_URL}/services/audio/asr/transcription`,
    {
      model,
      input: { file_urls: [url] },
      parameters: { language_hints: languageHints }
    },
    {
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable'
      },
      validateStatus: (s) => s >= 200 && s < 500
    }
  );

  if (submitResp.status >= 400) {
    const msg =
      submitResp?.data?.message ||
      submitResp?.data?.msg ||
      submitResp?.data?.code ||
      `HTTP ${submitResp.status}`;
    throw new Error(`DashScope 转写任务提交失败: ${msg}`);
  }

  const taskId = submitResp?.data?.output?.task_id || '';
  if (!taskId) throw new Error('DashScope 未返回 task_id');

  const startedAt = Date.now();
  let waitMs = 1000;
  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(waitMs);
    waitMs = Math.min(Math.round(waitMs * 1.6), 5000);

    const statusResp = await axios.get(`${DEFAULT_BASE_URL}/tasks/${encodeURIComponent(taskId)}`, {
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json'
      },
      validateStatus: (s) => s >= 200 && s < 500
    });

    if (statusResp.status >= 400) {
      const msg =
        statusResp?.data?.message ||
        statusResp?.data?.msg ||
        statusResp?.data?.code ||
        `HTTP ${statusResp.status}`;
      throw new Error(`DashScope 转写任务查询失败: ${msg}`);
    }

    const output = statusResp?.data?.output || {};
    const taskStatus = output.task_status || '';
    if (!taskStatus) continue;

    if (taskStatus === 'SUCCEEDED') {
      const results = Array.isArray(output.results) ? output.results : [];
      const transcriptionUrl = results?.[0]?.transcription_url || '';
      if (!transcriptionUrl) return '';

      const resultResp = await axios.get(transcriptionUrl, {
        timeout: 20000,
        headers: { Accept: 'application/json' }
      });
      const text = resultResp?.data?.transcripts?.[0]?.text || '';
      return typeof text === 'string' ? text.trim() : '';
    }

    if (taskStatus === 'FAILED' || taskStatus === 'CANCELED' || taskStatus === 'UNKNOWN') {
      const msg = output.message || statusResp?.data?.message || '任务失败';
      throw new Error(`DashScope 转写失败: ${msg}`);
    }
  }

  throw new Error('DashScope 转写超时');
};

