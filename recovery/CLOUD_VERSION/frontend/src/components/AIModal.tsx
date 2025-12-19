import React, { useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../apiClient';

interface AIModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebookId: string;
  notebookName?: string;
  startDate?: string;
  endDate?: string;
}

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
};

const AIModal: React.FC<AIModalProps> = ({
  isOpen,
  onClose,
  notebookId,
  notebookName,
  startDate,
  endDate
}) => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen) return null;

  const dateRangeLabel = useMemo(() => {
    if (!startDate || !endDate) return '';
    return `${startDate} 至 ${endDate}`;
  }, [startDate, endDate]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [isOpen, chatMessages.length]);

  const resetChat = () => {
    setChatMessages([]);
    setChatInput('');
  };

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || loading) return;
    if (!notebookId) {
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
      const resp = await apiClient.post(
        `/api/notebooks/${encodeURIComponent(notebookId)}/assistant-chat`,
        {
          messages: nextMessages,
          startDate,
          endDate
        }
      );
      const reply =
        resp.data?.reply ||
        (resp.data?.success === false ? resp.data?.message : null) ||
        'AI 暂时无法回答这个问题，请稍后重试。';
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (error: any) {
      console.error('AI助手请求失败:', error);
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '抱歉，聊天服务当前不可用，请稍后再试。'
        }
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
        label: '24小时热点',
        prompt:
          '从本笔记本最近的记录中，提炼过去 24 小时最重要的 5 条信息/动态，并给出每条的简短解读。'
      },
      {
        label: '多维度深度调研',
        prompt:
          '基于我的笔记内容，帮我做一个多维度深度调研框架：问题定义、关键维度、数据来源、验证方法、输出结构。'
      },
      {
        label: '寻找解决方案',
        prompt:
          '基于我的笔记，帮我列出当前遇到的主要问题点，并给出 3-5 个可执行解决方案（含利弊与下一步）。'
      },
      {
        label: '搜索金句/观点',
        prompt:
          '基于我的笔记，帮我提炼 10 条金句/观点（尽量保留原意，可适度润色），并标注来源笔记标题（如能推断）。'
      }
    ],
    [dateRangeLabel]
  );

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] mx-4 flex flex-col overflow-hidden"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div className="text-[11px] text-slate-400">
              {notebookName ? `来自「${notebookName}」` : 'AI 助手'}
              {dateRangeLabel ? ` · ${dateRangeLabel}` : ''}
            </div>
            <h2 className="text-sm font-semibold text-slate-900">AI总结和建议</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetChat}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              title="重置对话"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4 4v6h6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M20 20v-6h-6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M20 9a8 8 0 0 0-14.9-3M4 15a8 8 0 0 0 14.9 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              title="关闭"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 bg-slate-50/60">
          {chatMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                <svg
                  className="h-5 w-5 text-slate-700"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 8h10M7 12h6M21 12c0 4.418-4.03 8-9 8a10.3 10.3 0 0 1-2.09-.21L3 21l1.3-3.35A7.7 7.7 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="text-xl font-semibold text-slate-900">你好，我是你的AI助手</div>
              <div className="mt-2 text-sm text-slate-500">你可以这样问我</div>
              <div className="mt-6 w-full max-w-sm space-y-3">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => sendMessage(action.prompt)}
                    className="w-full rounded-full bg-white px-5 py-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {chatMessages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={`${msg.role}-${idx}`}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        isUser
                          ? 'bg-[#06c3a8] text-white'
                          : 'bg-white text-slate-800'
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

        <div className="border-t border-slate-100 bg-white px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(chatInput);
                }
              }}
              rows={1}
              placeholder={dateRangeLabel ? '基于选定范围提问…' : '基于当前笔记本提问…'}
              className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 focus:border-[#6bd8c0] focus:outline-none focus:ring-2 focus:ring-[#b5ece0]"
            />
            <button
              type="button"
              onClick={() => sendMessage(chatInput)}
              disabled={loading || !chatInput.trim()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#06c3a8] text-white shadow-sm hover:bg-[#04b094] disabled:cursor-not-allowed disabled:opacity-60"
              title="发送"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M22 2L11 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M22 2L15 22l-4-9-9-4L22 2Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            基于本笔记本内容生成总结/建议；如信息不足会提示你补充。
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIModal;
