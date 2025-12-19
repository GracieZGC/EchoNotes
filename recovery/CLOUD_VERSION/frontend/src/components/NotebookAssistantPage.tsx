import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useLocation } from 'react-router-dom';
import apiClient, { type Notebook, type Note } from '../apiClient';
import { getDisplayTitle } from '../utils/displayTitle';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
};

const NotebookAssistantPage = ({ notebookId }: { notebookId: string }) => {
  const location = useLocation();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  // 空字符串表示“跟随当前笔记本”，下拉展示为「选择笔记本」
  const [selectedNotebookId, setSelectedNotebookId] = useState<string>('');
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [loadingNotebooks, setLoadingNotebooks] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notebookDropdownOpen, setNotebookDropdownOpen] = useState(false);
  const [selectionPanelOpen, setSelectionPanelOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { startDate, endDate } = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const start = params.get('startDate') || '';
    const end = params.get('endDate') || '';
    return { startDate: start, endDate: end };
  }, [location.search]);

  const dateRangeLabel = useMemo(() => {
    if (!startDate || !endDate) return '';
    return `${startDate} 至 ${endDate}`;
  }, [startDate, endDate]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [chatMessages.length]);

  // 同步外部 notebookId 变更
  // 加载笔记本列表
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoadingNotebooks(true);
        const list = await apiClient.getNotebooks();
        if (cancelled) return;
        setNotebooks(list);
      } catch (error) {
        console.error('加载笔记本失败:', error);
      } finally {
        if (!cancelled) {
          setLoadingNotebooks(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // 只在首次挂载时加载列表
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 加载选中笔记本下的笔记列表
  useEffect(() => {
    let cancelled = false;
    const loadNotes = async () => {
      const effectiveNotebookId = selectedNotebookId || notebookId;
      if (!effectiveNotebookId) {
        setNotes([]);
        setSelectedNoteIds([]);
        return;
      }
      try {
        setLoadingNotes(true);
        const resp = await apiClient.getNotes(effectiveNotebookId);
        if (cancelled) return;
        setNotes(resp.notes || []);
        // 切换笔记本时清空已选笔记
        setSelectedNoteIds([]);
      } catch (error) {
        console.error('加载笔记失败:', error);
        if (!cancelled) {
          setNotes([]);
          setSelectedNoteIds([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingNotes(false);
        }
      }
    };
    loadNotes();
    return () => {
      cancelled = true;
    };
  }, [selectedNotebookId]);

  const handleBackToHome = () => {
    setChatMessages([]);
    setChatInput('');
  };

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || loading) return;
    const targetNotebookId = selectedNotebookId || notebookId;
    if (!targetNotebookId) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '缺少 notebookId，无法发起分析。' }
      ]);
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...chatMessages,
      { role: 'user', content: trimmed }
    ];

    setChatMessages(nextMessages);
    setChatInput('');
    setLoading(true);

    try {
      const payload: any = {
        messages: nextMessages,
        startDate,
        endDate
      };
      if (selectedNoteIds.length > 0) {
        payload.noteIds = selectedNoteIds;
      }

      const resp = await apiClient.post(
        `/api/notebooks/${encodeURIComponent(targetNotebookId)}/assistant-chat`,
        payload
      );
      const reply =
        resp.data?.reply ||
        (resp.data?.success === false ? resp.data?.message : null) ||
        'AI 暂时无法回答这个问题，请稍后重试。';
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '抱歉，聊天服务当前不可用，请稍后再试。' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = useMemo(
    () => [
      {
        label: '帮我生成周报',
        prompt: dateRangeLabel
          ? `基于「${dateRangeLabel}」的笔记，帮我生成一份周报（工作内容/产出/问题/下周计划），用 Markdown 分点。`
          : '基于本笔记本最近的笔记，帮我生成一份周报（工作内容/产出/问题/下周计划），用 Markdown 分点。'
      },
      {
        label: '整理一周待办',
        prompt: dateRangeLabel
          ? `基于「${dateRangeLabel}」的笔记，帮我整理待办清单：按优先级/负责人(如能推断)/截止时间(如有)分类输出。`
          : '基于本笔记本最近的笔记，帮我整理待办清单：按优先级/负责人(如能推断)/截止时间(如有)分类输出。'
      },
      {
        label: '梳理本周亮点',
        prompt: dateRangeLabel
          ? `请基于「${dateRangeLabel}」时间范围内的笔记，总结 3–5 条本周最重要的成果亮点，适合写在周报里。`
          : '请从最近的笔记中，总结 3–5 条本周最重要的成果亮点，适合写在周报里。'
      },
      {
        label: '项目复盘建议',
        prompt:
          '基于这些笔记内容，帮我做一个项目复盘：包含背景、关键事件、做得好的地方、问题与风险、改进建议。'
      },
      {
        label: '整理核心知识点',
        prompt:
          '请从这些学习/阅读相关笔记中提炼核心知识点，用分点方式列出概念+一句话解释，方便我快速复习。'
      },
      {
        label: '生成记忆卡片',
        prompt:
          '基于这些笔记内容，帮我生成 8–10 条记忆卡片，每条包含【问题】和【答案】，用于间隔复习。'
      },
      {
        label: '情绪盘点',
        prompt:
          '请阅读这些笔记，从中识别最近的情绪变化，给出 3–5 条情绪关键词、可能的触发因素和调节建议。'
      },
      {
        label: '挖掘可写选题',
        prompt:
          '基于这些笔记，帮我挖掘 5–8 个可以写成文章或输出内容的选题，并给出每个选题的一句话角度说明。'
      }
    ],
    [dateRangeLabel]
  );

  const selectionLabel = useMemo(() => {
    if (selectedNoteIds.length > 0) {
      return `已选择 ${selectedNoteIds.length} 条笔记`;
    }
    if (dateRangeLabel) {
      return `时间范围：${dateRangeLabel}`;
    }
    return '';
  }, [selectedNoteIds.length, dateRangeLabel]);

  const placeholderText = useMemo(() => {
    if (selectedNoteIds.length > 0) {
      return '基于已选笔记提问…';
    }
    if (dateRangeLabel) {
      return '基于选定范围提问…';
    }
    return '基于当前笔记本提问…';
  }, [selectedNoteIds.length, dateRangeLabel]);

  const toggleNoteSelection = (noteId: string) => {
    setSelectedNoteIds((prev) =>
      prev.includes(noteId) ? prev.filter((id) => id !== noteId) : [...prev, noteId]
    );
  };

  const handleSelectAllNotes = () => {
    const allIds = notes.map((n) => n.note_id);
    setSelectedNoteIds(allIds);
  };

  const handleClearSelectedNotes = () => {
    setSelectedNoteIds([]);
  };

  const canSend = useMemo(
    () => Boolean(chatInput.trim() || selectedNoteIds.length > 0),
    [chatInput, selectedNoteIds.length]
  );

  const quickActionCount = quickActions.length || 1;

  const handleAttachClick = () => {
    if (loading) return;
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    // 这里先只触发选择文件操作，后续如需上传可在此扩展
    console.log('Selected attachment files:', files);
  };

  const renderMainInput = (variant: 'hero' | 'inline') => {
    const containerClasses =
      variant === 'hero'
        ? 'mt-6 w-full max-w-3xl mx-auto'
        : 'w-full max-w-3xl';
    const sendButtonSize = 'h-[35px] w-[35px]';

    return (
      <div className={containerClasses}>
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-3 shadow-[0_18px_40px_rgba(10,34,61,0.04)]">
          <div className="flex items-end gap-3">
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(chatInput);
                  }
                }}
                rows={3}
                placeholder={placeholderText}
                className="w-full resize-none border-none bg-transparent pl-2 pr-2 pt-2 pb-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-0"
              />
              <div className="absolute bottom-1 left-1 flex h-[35px] w-[35px] items-center justify-center">
                <button
                  type="button"
                  onClick={handleAttachClick}
                  className="flex h-[35px] w-[35px] items-center justify-center"
                  title="上传附件"
                >
                  <svg
                    className="h-[40px] w-[40px] text-[#06c3a8]"
                    viewBox="0 0 1024 1024"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M512 2.56C231.424 2.56 3.584 229.888 3.584 510.976S231.424 1018.88 512 1018.88s508.416-227.328 508.416-508.416S793.088 2.56 512 2.56z m0 941.568c-239.616 0-433.664-194.048-433.664-433.664C78.336 270.848 272.384 76.8 512 76.8s433.664 194.048 433.664 433.664-194.048 433.664-433.664 433.664z"
                      fill="currentColor"
                    />
                    <path
                      d="M699.904 252.416c-61.952-34.816-140.8-13.824-176.128 47.616l-9.728 16.384c-1.024 1.024-1.536 2.048-2.048 3.072l-126.976 220.16c-10.752 18.944-13.824 41.472-8.192 61.952 5.12 19.456 17.408 35.84 34.816 45.568 11.264 6.656 24.064 10.24 37.376 10.24 6.656 0 13.312-1.024 19.968-2.56 20.48-5.632 38.4-18.944 49.152-37.888L629.76 429.056c4.608-7.68 2.048-17.92-5.632-23.04-7.68-4.608-17.92-2.048-23.04 5.632l-111.616 187.904c-6.656 11.264-16.896 19.456-28.672 22.528-10.752 3.072-22.528 1.536-32.256-4.096-9.216-5.12-16.384-14.336-18.944-25.088-3.584-11.776-1.536-25.6 5.12-36.352l46.08-80.896 0.512 0.512L552.96 316.928c26.112-45.056 84.992-60.928 130.56-35.328 45.056 26.112 60.928 84.992 35.328 130.56l-19.968 34.304c-1.024 1.024-2.048 2.048-2.56 3.584l-131.584 227.328c-19.968 34.816-52.224 59.392-90.624 69.632-37.376 10.24-75.776 5.12-109.056-13.824-32.768-18.944-56.832-49.664-66.56-87.04-10.24-38.4-4.608-78.848 15.36-113.664l128.512-222.72c4.608-8.192 2.048-17.92-6.144-23.04s-17.92-2.048-23.04 6.144l-128.512 222.72c-25.088 43.008-31.232 92.16-18.944 139.264 12.288 46.08 41.472 83.968 82.432 107.52 26.624 15.872 56.832 23.552 87.552 23.552 15.872 0 31.232-2.048 47.104-6.144 42.496-11.264 78.336-37.376 102.912-73.728l1.024 0.512L747.52 428.544c34.816-61.44 13.824-140.8-47.616-176.128z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => sendMessage(chatInput)}
              disabled={loading || !canSend}
              className={`inline-flex items-center justify-center ${sendButtonSize} transition ${
                !canSend ? 'text-slate-300 cursor-not-allowed' : 'text-[#06c3a8] hover:text-[#04b094]'
              }`}
              title="发送"
            >
              <svg
                className="h-[40px] w-[40px]"
                viewBox="0 0 1024 1024"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M512 64.383234C264.7878 64.383234 64.383234 264.7878 64.383234 512s200.404567 447.616766 447.616766 447.616766 447.616766-200.404567 447.616766-447.616766S759.2122 64.383234 512 64.383234zM649.153661 476.550387c-14.514842 12.958403-36.414339 11.264-48.914906-3.784303l-50.402874-60.683752 0 287.768527c0 19.858651-15.528623 35.958547-34.684168 35.958547s-34.684168-16.098874-34.684168-35.958547L480.467545 409.174866l-57.516711 64.531417c-13.000303 14.585357-34.942723 15.483657-49.011992 2.005078-14.068248-13.477557-14.933844-36.227321-1.934563-50.812679l106.756599-119.777341c20.609788-23.122778 55.10285-22.477924 74.964567 1.433804l99.077621 119.283737C665.302611 440.886164 663.668503 463.590962 649.153661 476.550387z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end text-[11px] text-slate-600">
          <button
            type="button"
            onClick={() => setSelectionPanelOpen(prev => !prev)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <span className="truncate max-w-[180px]">
              {selectionLabel || '选择笔记 / 时间范围'}
            </span>
            <svg
              className={`h-3 w-3 flex-shrink-0 transition-transform ${
                selectionPanelOpen ? 'rotate-180' : ''
              }`}
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M6 9l6 6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {selectionPanelOpen && renderSelectionPanel()}
      </div>
    );
  };

  const renderSelectionPanel = () => {
    const selectedNotebook =
      selectedNotebookId && notebooks.find(nb => nb.notebook_id === selectedNotebookId);
    const notebookLabel = selectedNotebook ? selectedNotebook.name : '选择笔记本';

    return (
      <div className="mt-3">
        <div className="rounded-2xl border border-[#b5ece0] bg-[#e8f7f3] px-4 py-3 shadow-sm shadow-[#b5ece0]/40">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">分析范围</span>
              {selectionLabel && (
                <span className="rounded-full bg-[#e8f7f3] px-2 py-0.5 text-[11px] text-[#0a6154]">
                  {selectionLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative min-w-[200px]">
                <button
                  type="button"
                  onClick={() => setNotebookDropdownOpen(prev => !prev)}
                  disabled={loadingNotebooks}
                  className="w-full flex items-center justify-between rounded-full border border-[#90e2d0] bg-gradient-to-r from-[#eef6fd]/60 to-white px-4 py-1.5 text-xs text-[#0a917a] hover:border-[#6bd8c0] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="truncate">{notebookLabel}</span>
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
                {notebookDropdownOpen && (
                  <div className="absolute left-0 top-full z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border-2 border-[#b5ece0] bg-white shadow-xl shadow-[#c4f1e5]">
                    <div className="p-2 text-xs">
                      {notebooks.length === 0 ? (
                        <div className="px-4 py-3 text-center text-gray-500">暂无笔记本，请先创建。</div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedNotebookId('');
                              setNotebookDropdownOpen(false);
                            }}
                            className={`w-full rounded-lg px-4 py-2 text-left transition-colors ${
                              !selectedNotebookId
                                ? 'bg-[#eef6fd] text-[#0a6154] font-medium'
                                : 'text-gray-900 hover:bg-[#eef6fd]'
                            }`}
                          >
                            <span>选择笔记本</span>
                          </button>
                          {notebooks.map(nb => {
                            const isSelected = selectedNotebookId === nb.notebook_id;
                            return (
                              <button
                                key={nb.notebook_id}
                                type="button"
                                onClick={() => {
                                  setSelectedNotebookId(nb.notebook_id);
                                  setNotebookDropdownOpen(false);
                                }}
                                className={`w-full rounded-lg px-4 py-2 text-left transition-colors ${
                                  isSelected
                                    ? 'bg-[#eef6fd] text-[#0a6154] font-medium'
                                    : 'text-gray-900 hover:bg-[#eef6fd]'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span>{nb.name}</span>
                                  <span className="ml-2 text-gray-500" style={{ fontSize: '12px' }}>
                                    ({nb.note_count || 0}条笔记)
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500">笔记</span>
              <button
                type="button"
                onClick={handleSelectAllNotes}
                disabled={loadingNotes || notes.length === 0}
                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 hover:border-[#6bd8c0] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                全选
              </button>
              <button
                type="button"
                onClick={handleClearSelectedNotes}
                disabled={selectedNoteIds.length === 0}
                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 hover:border-rose-200 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                清空
              </button>
              <span className="text-slate-400">
                {loadingNotes ? '加载笔记中…' : `共 ${notes.length} 条`}
              </span>
            </div>
          </div>
          {notes.length > 0 && (
            <div className="mt-2 max-h-28 overflow-y-auto rounded-xl bg-slate-50/60 p-2 text-[11px] text-slate-700">
              {notes.map((note) => {
                const id = note.note_id;
                const checked = selectedNoteIds.includes(id);
                const displayTitle = getDisplayTitle({
                  title: note.title,
                  content: note.content,
                  content_text: (note as any).content_text,
                  component_instances: (note as any).component_instances,
                  component_data: (note as any).component_data
                });
                const date = (note.updated_at || note.created_at || '').slice(0, 10);
                return (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1 ${
                      checked ? 'bg-white shadow-sm shadow-[#c9f0e5]' : 'hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-3 w-3 rounded border-slate-300 text-[#06c3a8] focus:ring-[#06c3a8]"
                        checked={checked}
                        onChange={() => toggleNoteSelection(id)}
                      />
                      <span className="max-w-[220px] truncate text-[11px] font-medium text-slate-800">
                        {displayTitle || note.title || '未命名笔记'}
                      </span>
                    </div>
                    <span className="shrink-0 text-[10px] text-slate-400">{date}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col px-4 pb-10">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        onChange={handleFilesSelected}
        className="hidden"
      />
      {chatMessages.length > 0 && (
        <div className="px-5 pb-2">
          <button
            type="button"
            onClick={handleBackToHome}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M12.5 4.16666L7.08333 9.58332L12.5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            返回
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-4">
        {chatMessages.length === 0 ? (
          <div className="mt-6 flex flex-col items-center">
            <div className="relative w-full max-w-3xl mx-auto h-[260px]">
              {/* 中间插画 + 标题 */}
              <div className="absolute left-1/2 top-[58%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
                <img
                  src="/illustrations/ai-note-hero.svg"
                  alt="AI 助手"
                  className="mb-4 h-[180px] w-[180px] object-contain"
                />
                <div className="mb-1 text-xl font-semibold text-slate-900">你好，我是你的AI助手</div>
              </div>

              {/* 环绕标签（主要分布在左右两侧） */}
              {quickActions.map((action, index) => {
                const t = quickActionCount === 1 ? 0.5 : index / (quickActionCount - 1);
                const start = 0;
                const end = 2 * Math.PI;
                const angle = start + (end - start) * t;
                const radiusX = 340;
                const radiusY = 170;
                const yOffset = 24;
                const x = radiusX * Math.cos(angle);
                const y = radiusY * Math.sin(angle) + yOffset;

                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      setChatInput(action.prompt);
                      if (textareaRef.current) {
                        textareaRef.current.focus();
                      }
                    }}
                    className="pointer-events-auto absolute inline-flex items-center rounded-full bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm shadow-[#e1f1ff] hover:bg-[#f5fbff] border border-[#e4f0ff]/80 whitespace-nowrap"
                    style={{
                      left: `calc(50% + ${x}px)`,
                      top: `calc(50% + ${y}px)`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-14 w-full">
              {renderMainInput('hero')}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {chatMessages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div key={`${msg.role}-${idx}`} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm shadow-sm ${
                      isUser ? 'bg-[#06c3a8] text-white' : 'bg-white text-slate-800'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                  正在思考…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {chatMessages.length > 0 && (
        <div className="mt-3 px-5">
          {renderMainInput('inline')}
        </div>
      )}
    </div>
  );
};

export default NotebookAssistantPage;
