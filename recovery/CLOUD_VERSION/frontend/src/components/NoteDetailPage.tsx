import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode
} from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../apiClient';
import { getDisplayTitle } from '../utils/displayTitle';
import { renderRichText } from '../utils/richText';
import {
  ComponentInstance as TemplateComponentInstance,
  smartSync,
  getComponentConfig
} from '../utils/componentSync';
import { getComponentTitle as getDefaultComponentTitle, recordComponentTypes } from '../utils/componentTypes';
import { formatDateTimeChinese } from '../utils/dateFormatter';
import { renderContentWithLinks } from '../utils/linkify';
import ImageViewer from './ImageViewer';

interface Note {
  note_id: string;
  notebook_id: string;
  title: string;
  content: string;
  content_text: string;
  image_url?: string;
  images?: string[];
  image_urls?: string;
  image_files?: string;
  source_url?: string;
  source?: string;
  original_url?: string;
  author?: string;
  upload_time?: string;
  status?: string;
  created_at: string;
  updated_at: string;
  component_instances?: string | NoteComponentInstance[];
  component_data?: string | ComponentDataMap;
}

type ComponentDataEntry = {
  value?: string;
  title?: string;
  type?: string;
  [key: string]: any;
};

type ComponentDataMap = Record<string, ComponentDataEntry>;

interface NoteComponentInstance extends TemplateComponentInstance {
  dataMapping?: any;
  originalId?: string;
  [key: string]: any;
}

interface Notebook {
  notebook_id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  note_count?: number;
  description?: string;
  component_config?: unknown;
}

interface AIAnalysis {
  coreViewpoints: string;
  keywords: string[];
  knowledgeExtension: string;
  learningPath: string;
  chatSummary: string;
}

type ComponentDraft = {
  id: string;
  type: string;
  title: string;
  value: string;
};

const safeParseJSON = (value: unknown) => {
  if (typeof value !== 'string') return value;
  try {
    let parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // ignore
      }
    }
    return parsed;
  } catch {
    return null;
  }
};

const parseComponentData = (rawData: Note['component_data']): ComponentDataMap => {
  if (!rawData) return {};
  const parsed = safeParseJSON(rawData);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  return parsed as ComponentDataMap;
};

const normalizeComponentArray = (raw: unknown): NoteComponentInstance[] => {
  if (!raw) return [];

  const processed = safeParseJSON(raw);

  if (processed && typeof processed === 'object' && !Array.isArray(processed)) {
    const maybeArray =
      (processed as Record<string, unknown>).componentInstances ??
      (processed as Record<string, unknown>).instances;
    if (Array.isArray(maybeArray)) {
      return normalizeComponentArray(maybeArray);
    }
  }

  const arraySource = Array.isArray(processed) ? processed : Array.isArray(raw) ? raw : [];

  return arraySource
    .filter((item): item is NoteComponentInstance => Boolean(item) && typeof item === 'object')
    .map((item, index) => {
      const candidate = item as NoteComponentInstance;
      const id =
        (candidate.id && String(candidate.id)) ||
        (candidate.originalId && String(candidate.originalId)) ||
        `component-${index}`;

      return {
        ...candidate,
        id,
        type: String(candidate.type || ''),
        title: typeof candidate.title === 'string' ? candidate.title : '',
        content:
          candidate.content !== undefined
            ? String(candidate.content ?? '')
            : undefined
      };
    });
};

const enrichComponentsWithData = (
  instances: NoteComponentInstance[],
  dataMap: ComponentDataMap
): NoteComponentInstance[] => {
  return instances.map((instance) => {
    const dataEntry = dataMap[instance.id];

    const mergedTitle =
      (typeof dataEntry?.title === 'string' && dataEntry.title.trim() !== ''
        ? dataEntry.title
        : instance.title) || '';

    let dataContent = instance.content;
    if (instance.type === 'image' && dataEntry) {
      if (Array.isArray(dataEntry.urls) && dataEntry.urls.length > 0) {
        dataContent = dataEntry.urls.join(',');
      } else if (typeof dataEntry.value === 'string' && dataEntry.value.trim()) {
        dataContent = dataEntry.value;
      }
    } else if (dataEntry) {
      if (typeof dataEntry.value === 'string' && dataEntry.value.trim()) {
        dataContent = dataEntry.value;
      } else if (dataEntry.value !== undefined && dataEntry.value !== null) {
        dataContent = String(dataEntry.value);
      }
    }

    return {
      ...instance,
      title: mergedTitle,
      content: dataContent ?? ''
    };
  });
};

const isSourcePlatformComponent = (component: NoteComponentInstance) => {
  const title = String(component.title || '').toLowerCase();
  const type = String(component.type || '').toLowerCase();
  const id = String(component.id || '').toLowerCase();
  const dataField = String(
    (component as any)?.dataMapping?.field ||
      (component as any)?.dataMapping?.sourceField ||
      (component as any)?.dataMapping?.source ||
      ''
  ).toLowerCase();

  const matchesTitle =
    title.includes('来源平台') ||
    title.includes('source platform') ||
    (title.includes('来源') && !title.includes('链接'));
  const matchesType =
    type.includes('source_platform') ||
    (type.includes('source') && type.includes('platform'));
  const matchesId = id.includes('source_platform');
  const matchesMapping =
    dataField.includes('source_platform') ||
    dataField === 'platform' ||
    (dataField === 'source' && !dataField.includes('url'));

  return matchesTitle || matchesType || matchesId || matchesMapping;
};

const filterSourcePlatformComponents = (
  components: NoteComponentInstance[]
) => components.filter((component) => !isSourcePlatformComponent(component));

const NoteDetailPage: React.FC = () => {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { note?: Note; notebook?: Notebook } | null;
  const initialNote = locationState?.note ?? null;
  const [note, setNote] = useState<Note | null>(initialNote);
  const [notebook, setNotebook] = useState<Notebook | null>(locationState?.notebook ?? null);
  const [loading, setLoading] = useState(() => !initialNote);
  const [error, setError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSummary, setChatSummary] = useState('');
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiProcessingExpired, setAiProcessingExpired] = useState(false);
  const aiPollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiPollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFreshNote, setIsFreshNote] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('new') === '1';
  });
  const [editingComponents, setEditingComponents] = useState(false);
  const [componentDrafts, setComponentDrafts] = useState<ComponentDraft[]>([]);
  const [savingComponents, setSavingComponents] = useState(false);

  const fetchNoteDetail = useCallback(
    async (options: { withSpinner?: boolean } = {}) => {
      if (!noteId) return;
      const { withSpinner = true } = options;

      if (withSpinner) {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await apiClient.get(`/api/note-detail-data?id=${noteId}`);
        const { data } = response;

        if (data.error) {
          setError(data.error || '加载笔记失败');
          return;
        }

        if (data.success && data.note) {
          setNote(data.note);
          setNotebook(data.notebook);
        } else {
          setError(data.error || data.message || '加载笔记失败：数据格式异常');
        }
      } catch (err: any) {
        setError(err?.response?.data?.error || err?.message || '加载笔记失败');
      } finally {
        if (withSpinner) {
          setLoading(false);
        }
      }
    },
    [noteId]
  );

  useEffect(() => {
    // 如果通过路由 state 已经拿到了 note，就不再请求详情接口
    if (!note && noteId) {
      fetchNoteDetail();
    }
  }, [noteId, note, fetchNoteDetail]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const flag = params.get('new') === '1';
    setIsFreshNote(flag);
  }, [location.search]);

  const componentDataMap = useMemo(() => {
    const parsed = parseComponentData(note?.component_data);
    const rawHistory = parsed?.article_parse_history?.value;
    const normalizedHistory =
      (typeof rawHistory === 'string' ? safeParseJSON(rawHistory) : rawHistory) as any;
    const historyFields = normalizedHistory?.fields || normalizedHistory?.parsed_fields;
    const aiPlatform =
      historyFields?.source_platform || historyFields?.platform || historyFields?.channel;
    if (aiPlatform) {
      const overrideValue = String(aiPlatform).trim();
      Object.keys(parsed).forEach((key) => {
        if (!key || typeof key !== 'string') return;
        if (key.toLowerCase().includes('source_platform')) {
          const existingEntry = parsed[key] || {};
          parsed[key] = {
            type: existingEntry.type || 'text-short',
            title: existingEntry.title || '来源平台',
            ...existingEntry,
            value: overrideValue
          };
        }
      });
    }
    return parsed;
  }, [note?.component_data]);

  const noteComponentInstances = useMemo(
    () => normalizeComponentArray(note?.component_instances),
    [note?.component_instances]
  );

  const notebookComponentInstances = useMemo(() => {
    const configSource =
      (notebook as any)?.component_config?.componentInstances ??
      (notebook as any)?.component_config ??
      (notebook as any)?.componentConfig ??
      null;
    return normalizeComponentArray(configSource);
  }, [notebook]);

  const enrichedNoteComponents = useMemo(
    () => enrichComponentsWithData(noteComponentInstances, componentDataMap),
    [noteComponentInstances, componentDataMap]
  );

  const enrichedNotebookComponents = useMemo(
    () => enrichComponentsWithData(notebookComponentInstances, componentDataMap),
    [notebookComponentInstances, componentDataMap]
  );

  const combinedComponents =
    enrichedNoteComponents.length > 0 ? enrichedNoteComponents : enrichedNotebookComponents;

  const hasGeneratedAIFields = useMemo(() => {
    const entries = Object.values(componentDataMap || {});
    if (!entries.length) return false;
    return entries.some((entry: any) => {
      if (!entry) return false;
      const title = String(entry.title || '').toLowerCase();
      const source = String(
        entry.sourceField || (entry as any)?.dataMapping?.source || ''
      ).toLowerCase();
      const rawValue = entry.value ?? entry.content;
      const value =
        typeof rawValue === 'string'
          ? rawValue.trim()
          : rawValue !== undefined && rawValue !== null
            ? String(rawValue).trim()
            : '';
      if (!value) return false;
      if (title.includes('关键词') || title.includes('keyword') || source === 'keywords') {
        return true;
      }
      if (title.includes('摘要') || title.includes('summary') || source === 'summary') {
        return true;
      }
      return false;
    });
  }, [componentDataMap]);

  const isRecentByTimestamp = useMemo(() => {
    if (!note?.created_at) return false;
    const createdAt = new Date(note.created_at).getTime();
    return Date.now() - createdAt < 30 * 1000;
  }, [note?.created_at]);

  const clearAiPollingRefs = useCallback(() => {
    if (aiPollingIntervalRef.current) {
      clearInterval(aiPollingIntervalRef.current);
      aiPollingIntervalRef.current = null;
    }
    if (aiPollingTimeoutRef.current) {
      clearTimeout(aiPollingTimeoutRef.current);
      aiPollingTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const shouldMonitorAI = isFreshNote || isRecentByTimestamp;
    if (!shouldMonitorAI) {
      setAiProcessing(false);
      clearAiPollingRefs();
      return;
    }

    if (hasGeneratedAIFields) {
      setAiProcessing(false);
      setAiProcessingExpired(false);
      clearAiPollingRefs();
      if (location.search.includes('new=1')) {
        navigate(`/note/${noteId}`, { replace: true });
      }
      setIsFreshNote(false);
      return;
    }

    setAiProcessing(true);
    setAiProcessingExpired(false);

    if (!aiPollingIntervalRef.current) {
      aiPollingIntervalRef.current = setInterval(() => {
        fetchNoteDetail({ withSpinner: false });
      }, 3000);
      aiPollingTimeoutRef.current = setTimeout(() => {
        setAiProcessing(false);
        setAiProcessingExpired(true);
        setIsFreshNote(false);
        clearAiPollingRefs();
      }, 30 * 1000);
    }

    return () => {
      clearAiPollingRefs();
    };
  }, [
    hasGeneratedAIFields,
    isFreshNote,
    isRecentByTimestamp,
    fetchNoteDetail,
    clearAiPollingRefs,
    noteId,
    navigate,
    location.search
  ]);

  const components = useMemo(() => {
    const hasSourcePlatform = combinedComponents.some((comp) => {
      const id = String(comp.id || '').toLowerCase();
      const title = String(comp.title || '').toLowerCase();
      const dataField = String(
        (comp as any)?.dataMapping?.field ||
          (comp as any)?.dataMapping?.sourceField ||
          (comp as any)?.dataMapping?.source ||
          ''
      ).toLowerCase();

      return (
        id.includes('source_platform') ||
        id.includes('platform') ||
        dataField === 'source_platform' ||
        dataField === 'platform' ||
        title.includes('来源平台') ||
        title.includes('source platform')
      );
    });

    if (hasSourcePlatform) {
      return combinedComponents.filter((comp) => {
        const id = String(comp.id || '').toLowerCase();
        const title = String(comp.title || '').toLowerCase();
        const dataField = String(
          (comp as any)?.dataMapping?.field ||
            (comp as any)?.dataMapping?.sourceField ||
            (comp as any)?.dataMapping?.source ||
            ''
        ).toLowerCase();

        if (id === 'auto_source') {
          return false;
        }
        if (title === '来源' && !id.includes('platform') && !id.includes('url')) {
          return false;
        }
        if (dataField === 'source' && !dataField.includes('platform') && !dataField.includes('url')) {
          if (title.includes('来源') && !title.includes('平台') && !title.includes('链接')) {
            return false;
          }
        }

        return true;
      });
    }

    return filterSourcePlatformComponents(combinedComponents);
  }, [combinedComponents]);

  const titleFromComponents = useMemo(() => {
    const longText = components.find((c) => c.type === 'text-long' && c.content?.trim());
    if (longText) {
      return getDisplayTitle(longText.content || '');
    }
    const shortText = components.find((c) => c.type === 'text-short' && c.content?.trim());
    if (shortText) {
      return shortText.content || '';
    }
    return '';
  }, [components]);

  const displayTitle = useMemo(() => {
    if (!note) return '笔记详情';
    if (note.title && note.title !== '无标题' && note.title.trim() !== '') {
      return getDisplayTitle(note.title);
    }
    if (titleFromComponents) {
      return getDisplayTitle(titleFromComponents);
    }
    if (note.content_text) {
      return getDisplayTitle(note.content_text);
    }
    return '笔记详情';
  }, [note, titleFromComponents]);

  const handleOpenImages = (urls: string[], index = 0) => {
    if (!urls || urls.length === 0) return;
    setCurrentImageUrls(urls);
    setCurrentImageIndex(index);
    setImageViewerOpen(true);
  };

  const getPrimaryImageUrls = (): string[] => {
    const urls: string[] = [];
    if (Array.isArray(note?.images) && note?.images.length) {
      urls.push(...(note?.images || []));
    }
    if (typeof note?.image_urls === 'string' && note?.image_urls.trim()) {
      urls.push(
        ...note.image_urls
          .split(/[\n,]/)
          .map((u) => u.trim())
          .filter(Boolean)
      );
    }
    if (typeof note?.image_url === 'string' && note?.image_url.trim()) {
      urls.push(note.image_url.trim());
    }
    return Array.from(new Set(urls));
  };

  const renderField = (label: string, content: ReactNode, options?: { mono?: boolean }) => {
    if (content === null || content === undefined || content === '') return null;
    return (
      <div className="flex items-start gap-2 text-sm">
        <div className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400 flex-shrink-0" />
        <div className="flex-1">
          <div className="text-xs text-slate-400 mb-0.5">{label}</div>
          <div
            className={`text-[13px] leading-relaxed text-slate-900 ${
              options?.mono ? 'font-mono break-all' : ''
            }`}
          >
            {content}
          </div>
        </div>
      </div>
    );
  };

  // 组件编辑草稿初始化
  useEffect(() => {
    if (!note) return;
    const drafts = combinedComponents.map((comp, index) => ({
      id: comp.id || `component-${index}`,
      type: comp.type || 'text-short',
      title: comp.title || getDefaultComponentTitle(comp.type) || '未命名字段',
      value: comp.content !== undefined && comp.content !== null ? String(comp.content) : ''
    }));
    setComponentDrafts(drafts);
  }, [combinedComponents, note?.note_id]);

  const handleAddDraft = (type: string) => {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setComponentDrafts((prev) => [
      ...prev,
      {
        id,
        type,
        title: getDefaultComponentTitle(type) || '未命名字段',
        value: ''
      }
    ]);
  };

  const handleDraftChange = (id: string, patch: Partial<ComponentDraft>) => {
    setComponentDrafts((prev) =>
      prev.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft))
    );
  };

  const handleRemoveDraft = (id: string) => {
    setComponentDrafts((prev) => prev.filter((draft) => draft.id !== id));
  };

  const handleCancelEdit = () => {
    const drafts = combinedComponents.map((comp, index) => ({
      id: comp.id || `component-${index}`,
      type: comp.type || 'text-short',
      title: comp.title || getDefaultComponentTitle(comp.type) || '未命名字段',
      value: comp.content !== undefined && comp.content !== null ? String(comp.content) : ''
    }));
    setComponentDrafts(drafts);
    setEditingComponents(false);
  };

  const handleSaveComponents = async () => {
    if (!note) return;
    try {
      setSavingComponents(true);
      const componentInstances = componentDrafts.map((draft) => ({
        id: draft.id,
        type: draft.type,
        title: draft.title.trim() || getDefaultComponentTitle(draft.type) || '未命名字段',
        config: getComponentConfig(draft.type)
      }));
      const componentData = componentDrafts.reduce<Record<string, any>>((acc, draft) => {
        acc[draft.id] = {
          title: draft.title,
          type: draft.type,
          value: draft.value
        };
        return acc;
      }, {});

      await apiClient.updateNoteComponents({
        noteId: note.note_id,
        componentInstances,
        componentData,
        syncToNotebook: true
      });
      setEditingComponents(false);
      await fetchNoteDetail({ withSpinner: false });
    } catch (err: any) {
      console.error('❌ 保存组件失败:', err);
      alert(err?.message || '保存组件失败');
    } finally {
      setSavingComponents(false);
    }
  };

  const handleChatSend = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || !note) return;

    const newMessages = [
      ...chatMessages,
      { role: 'user' as const, content: trimmed }
    ];

    setChatMessages(newMessages);
    setChatInput('');
    setAiLoading(true);

    try {
      const response = await apiClient.post('/api/note-chat', {
        note_id: note.note_id,
        messages: newMessages
      });

      const reply = response.data?.reply || 'AI 暂时无法回答这个问题，请稍后重试。';
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '抱歉，聊天服务当前不可用，请稍后再试。'
        }
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateAnalysis = async () => {
    if (!note) return;
    setAiLoading(true);

    try {
      const response = await apiClient.post('/api/note-ai-analysis', {
        note_id: note.note_id
      });

      setAiAnalysis(response.data?.analysis || null);
    } catch {
      setAiAnalysis(null);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        笔记加载中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-500">
        <div className="text-red-500">{error}</div>
        <button
          onClick={() => fetchNoteDetail()}
          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800"
        >
          重试
        </button>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        找不到这条笔记
      </div>
    );
  }

  const primaryImages = getPrimaryImageUrls();

  const aiBanner = (() => {
    if (!aiProcessing && !aiProcessingExpired) return null;
    return (
      <div className="mb-3 flex items-center justify-between rounded-xl border border-dashed border-[#90e2d0] bg-[#eef6fd]/80 px-3 py-2 text-xs text-[#0a6154]">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#d4f3ed] text-[11px] font-semibold text-[#0a6154]">
            AI
          </span>
          <span>
            {aiProcessing
              ? '正在为你生成解析与摘要，这需要几秒钟时间…'
              : 'AI 解析时间超过 30 秒，可能已终止。如需重新触发，请编辑或重新保存笔记。'}
          </span>
        </div>
        {aiProcessing && (
          <div className="flex items-center gap-1 text-[11px] text-[#0a917a]">
            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-[#eef6fd]0" />
            正在解析
          </div>
        )}
      </div>
    );
  })();

  return (
    <div className="h-full overflow-y-auto px-6 pb-10 pt-4">
      <div className="mb-4 flex items-center justify-between gap-3 mx-auto max-w-3xl">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <span className="sr-only">返回</span>
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12.5 4.16666L7.08333 9.58332L12.5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div>
            <div className="text-[11px] text-slate-400">
              {notebook?.name ? `来自「${notebook.name}」` : '笔记详情'}
            </div>
            <h1 className="mt-0.5 text-base font-semibold text-slate-900">
              {displayTitle}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChatOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <span>就这条笔记聊聊</span>
          </button>
          <button
            onClick={() => setEditingComponents((prev) => !prev)}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium shadow-sm ${
              editingComponents
                ? 'bg-[#06c3a8] text-white hover:bg-[#04b094]'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {editingComponents ? '退出编辑' : '编辑组件'}
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl">
        {aiBanner}

        <div className="space-y-5">
          {primaryImages.length > 0 && (
            <div
              className="relative h-52 w-full cursor-zoom-in overflow-hidden rounded-2xl bg-slate-100"
              onClick={() => handleOpenImages(primaryImages, 0)}
            >
              <img
                src={primaryImages[0]}
                alt="笔记主图"
                className="h-full w-full object-cover"
              />
              {primaryImages.length > 1 && (
                <div className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-white">
                  +{primaryImages.length - 1} 张图片
                </div>
              )}
            </div>
          )}

          {editingComponents ? (
            <div className="space-y-3 rounded-2xl border border-dashed border-[#90e2d0] bg-[#eef6fd]/70 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">编辑组件内容</div>
                <div className="text-xs text-slate-500">保存后同步到笔记本模板</div>
              </div>
              <div className="space-y-3">
                {componentDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="relative rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => handleRemoveDraft(draft.id)}
                      className="absolute right-5 top-5 z-10 inline-flex h-5 w-5 items-center justify-center text-base text-slate-400 hover:text-slate-600"
                      title="删除组件"
                    >
                      ×
                    </button>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                        <select
                          value={draft.type}
                          onChange={(e) => handleDraftChange(draft.id, { type: e.target.value })}
                          className="w-full md:w-36 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#6bd8c0] focus:outline-none focus:ring-2 focus:ring-[#b5ece0]"
                        >
                          {recordComponentTypes.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={draft.title}
                          onChange={(e) => handleDraftChange(draft.id, { title: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#6bd8c0] focus:outline-none focus:ring-2 focus:ring-[#b5ece0]"
                      placeholder="字段标题"
                    />
                  </div>
                </div>
                <textarea
                  value={draft.value}
                  onChange={(e) => handleDraftChange(draft.id, { value: e.target.value })}
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#6bd8c0] focus:outline-none focus:ring-2 focus:ring-[#b5ece0]"
                  placeholder="填写组件内容或数据"
                />
                <div className="mt-2 flex justify-end gap-2 pr-2">
                  <button
                    type="button"
                    onClick={() => handleCancelEdit()}
                    className="rounded-md border border-[#b5ece0] px-3 py-1 text-[11px] font-medium text-[#0a917a] hover:border-[#90e2d0] hover:bg-[#eef6fd]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveComponents}
                    disabled={savingComponents}
                    className="rounded-md bg-[#06c3a8] px-3 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-[#04b094] disabled:opacity-60"
                  >
                    {savingComponents ? '保存中…' : '保存'}
                  </button>
                </div>
              </div>
            ))}
          </div>
              <div className="flex flex-wrap items-center gap-2">
                {recordComponentTypes.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleAddDraft(opt.id)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-[#6bd8c0] hover:text-[#0a917a]"
                  >
                    + 添加{opt.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={savingComponents}
                  onClick={handleSaveComponents}
                  className="rounded-lg bg-[#06c3a8] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#04b094] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingComponents ? '保存中…' : '保存并同步'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {components.map((comp) => {
                if (!comp.content || !String(comp.content).trim()) return null;
                const title = comp.title || getDefaultComponentTitle(comp.type);
                const content = String(comp.content ?? '');

                if (comp.type === 'image') {
                  const urls = content
                    .split(/[\n,]/)
                    .map((u) => u.trim())
                    .filter(Boolean);
                  if (!urls.length) return null;
                  return (
                    <div
                      key={comp.id}
                      className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="inline-flex items-center rounded-full bg-[#06c3a8] px-3 py-1 text-[11px] font-medium text-white">
                          {title}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {urls.map((url, idx) => (
                          <button
                            key={url + idx}
                            type="button"
                            onClick={() => handleOpenImages(urls, idx)}
                            className="relative h-16 w-20 overflow-hidden rounded-lg bg-slate-100"
                          >
                            <img
                              src={url}
                              alt={title}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }

                const richRendered = renderRichText(content);

                return (
                  <div
                    key={comp.id}
                    className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center rounded-full bg-[#06c3a8] px-3 py-1 text-[11px] font-medium text-white">
                        {title}
                      </span>
                    </div>
                    <div className="prose prose-sm mt-3 max-w-none text-[13px] leading-relaxed text-slate-900">
                      {richRendered}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {chatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="flex h-[520px] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  笔记对话助手
                </div>
                <div className="text-[11px] text-slate-400">
                  基于当前笔记内容进行深入讨论
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="text-lg text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-[13px]">
              {chatSummary && (
                <div className="rounded-xl bg-[#eef6fd]/80 p-3 text-xs text-[#062b23]">
                  {chatSummary}
                </div>
              )}
              {chatMessages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-xs rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-slate-900 text-white shadow-lg shadow-[#8de2d5]'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t px-4 py-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                  placeholder="输入你的问题，例如：这篇内容的三条核心观点？"
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-[13px] focus:border-[#43ccb0] focus:outline-none focus:ring-1 focus:ring-[#43ccb0]"
                />
                <button
                  onClick={handleChatSend}
                  disabled={aiLoading}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {aiLoading ? '思考中…' : '发送'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ImageViewer
        images={currentImageUrls}
        currentIndex={currentImageIndex}
        isOpen={imageViewerOpen}
        onClose={() => setImageViewerOpen(false)}
        onNavigate={(newIndex) => setCurrentImageIndex(newIndex)}
      />
    </div>
  );
};

export default NoteDetailPage;
