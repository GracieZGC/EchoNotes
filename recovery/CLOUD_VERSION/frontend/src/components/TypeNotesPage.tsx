import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TypeNotesEditor from './TypeNotesEditor';
import { getQuickNoteDraft } from '../landing/LandingQuickNote';
import apiClient from '../apiClient';

type AttachmentType = 'image' | 'audio' | 'video' | 'file';

interface DraftPayload {
  html: string;
  plainText: string;
}

interface AttachmentItem {
  id: string;
  name: string;
  type: AttachmentType;
  url: string;
  size: number;
}

const deriveTitleFromDraft = (plainText: string): string => {
  const trimmed = plainText.trim();
  if (!trimmed) return '';
  const maxLength = 30;
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength)}…`;
};

const DEFAULT_AI_SUMMARY_PROMPT =
  '请用中文为以下内容生成：\n1) 一段 150-250 字的摘要\n2) 3-8 条要点列表\n注意保留事实与关键数据，避免编造。';

const TypeNotesPage: React.FC = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [initialContent, setInitialContent] = useState<DraftPayload | null>(null);
  const [editorContent, setEditorContent] = useState<{ html: string; text: string } | null>(null);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [parseOnlyLoading, setParseOnlyLoading] = useState(false);
  const [parseAssignLoading, setParseAssignLoading] = useState(false);

  useEffect(() => {
    const draft = getQuickNoteDraft();
    if (draft) {
      const derived = deriveTitleFromDraft(draft.plainText);
      setTitle(derived);
      setInitialContent({ html: draft.html, plainText: draft.plainText });
      setEditorContent({ html: draft.html, text: draft.plainText });
    }
  }, []);

  const handleContentChange = (content: { html: string; text: string }) => {
    setEditorContent(content);
  };

  const currentPlainText = editorContent?.text ?? initialContent?.plainText ?? '';
  const hasContent = currentPlainText.trim().length > 0;
  const isAnyParsing = parseOnlyLoading || parseAssignLoading;

  const handleParseOnly = async () => {
    if (!hasContent || isAnyParsing) return;
    try {
      setParseOnlyLoading(true);
      const response = await apiClient.post('/api/parse-text', {
        title: title.trim() || undefined,
        content: currentPlainText.trim()
      });
      if (!response?.data?.success) {
        throw new Error(response?.data?.error || '解析失败');
      }
      const historyId = response.data.data?.historyId;
      const go = window.confirm(`仅解析完成（历史ID：${historyId || '未知'}）。是否跳转到工作台查看？`);
      if (go) navigate('/workspace');
    } catch (error: any) {
      window.alert(error?.response?.data?.error || error?.message || '解析失败，请稍后重试。');
    } finally {
      setParseOnlyLoading(false);
    }
  };

  const handleParseAndAssign = async () => {
    if (!hasContent || isAnyParsing) return;
    try {
      setParseAssignLoading(true);
      const response = await apiClient.post('/api/parse-and-assign-text', {
        title: title.trim() || undefined,
        content: currentPlainText.trim(),
        aiSummaryConfig: { enabled: true, prompt: DEFAULT_AI_SUMMARY_PROMPT }
      });
      if (!response?.data?.success) {
        throw new Error(response?.data?.error || '解析并分配失败');
      }
      const message = response.data.data?.message || 'AI 解析并分配完成';
      const historyId = response.data.data?.historyId;
      const go = window.confirm(`${message}（历史ID：${historyId || '未知'}）。是否跳转到工作台查看？`);
      if (go) navigate('/workspace');
    } catch (error: any) {
      window.alert(error?.response?.data?.error || error?.message || '解析并分配失败，请稍后重试。');
    } finally {
      setParseAssignLoading(false);
    }
  };

  const handleAttachmentPick = (type: AttachmentType, files: FileList | null) => {
    if (!files) return;
    const payloads: AttachmentItem[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID?.() ?? `${file.name}-${Date.now()}`,
      name: file.name,
      type,
      url: URL.createObjectURL(file),
      size: file.size
    }));
    setAttachments((prev) => [...prev, ...payloads]);
  };

  const attachmentLabelMap: Record<AttachmentType, { label: string; hint: string }> = {
    image: { label: '添加图片', hint: '支持 PNG / JPG / WebP' },
    audio: { label: '添加音频', hint: '支持 MP3 / WAV' },
    video: { label: '添加视频', hint: '支持 MP4' },
    file: { label: '添加文件', hint: '支持 PDF / Word / CSV' }
  };

  const renderAttachmentPreview = (item: AttachmentItem) => {
    if (item.type === 'image') {
      return (
        <img
          src={item.url}
          alt={item.name}
          className="h-16 w-24 rounded-lg border border-slate-200 object-cover"
        />
      );
    }

    if (item.type === 'audio') {
      return (
        <audio controls className="w-full">
          <source src={item.url} />
        </audio>
      );
    }

    if (item.type === 'video') {
      return (
        <video controls className="h-24 w-36 rounded-lg border border-slate-200">
          <source src={item.url} />
        </video>
      );
    }

    return (
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <span className="text-[#06c3a8]">文件</span>
        <span className="truncate">{item.name}</span>
      </div>
    );
  };

  const attachmentDetails = useMemo(
    () =>
      attachments.map((item) => (
        <div
          key={item.id}
          className="flex min-h-[80px] w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white/80 p-3 text-[12px] text-slate-600 shadow-sm"
        >
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{item.type.toUpperCase()}</span>
            <span>{(item.size / 1024).toFixed(1)} KB</span>
          </div>
          {renderAttachmentPreview(item)}
        </div>
      )),
    [attachments]
  );

  return (
    <div className="min-h-screen bg-[#eef6fd]">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold text-slate-900">随手记</h1>
            <p className="mt-1 text-xs text-slate-500">
              
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              返回首页
            </button>
            <button
              type="button"
              onClick={handleParseOnly}
              disabled={!hasContent || isAnyParsing}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="仅做基础解析（不生成 AI 摘要，不自动分配）"
            >
              {parseOnlyLoading ? '解析中…' : '仅解析'}
            </button>
            <button
              type="button"
              onClick={handleParseAndAssign}
              disabled={!hasContent || isAnyParsing}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="AI 解析并自动分配到推荐笔记本"
            >
              {parseAssignLoading ? '处理中…' : '解析并分配'}
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#06c3a8] px-4 py-1.5 text-xs font-medium text-white shadow-md shadow-[#8de2d5] hover:bg-[#04b094]"
              onClick={() => {
                console.log('保存草稿（示例）:', {
                  title: title.trim(),
                  content: editorContent,
                  attachments
                });
                alert('当前为示例实现，实际保存逻辑可后续对接后端。');
              }}
            >
              保存草稿
            </button>
          </div>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入标题，例如：读书笔记、会议记录…"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none shadow-sm focus:border-[#06c3a8] focus:ring-1 focus:ring-[#06c3a8]"
          />
        </div>

        <div className="mb-6 space-y-3">
          <TypeNotesEditor
            initialHTML={initialContent?.html}
            onChange={handleContentChange}
            className="space-y-3"
          />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm shadow-[#d9f4ff]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
              {(['image', 'audio', 'video', 'file'] as AttachmentType[]).map((type) => (
                <label
                  key={type}
                  className="cursor-pointer rounded-full border border-slate-200 bg-slate-50 px-3 py-1 hover:border-[#43ccb0] hover:bg-white"
                >
                  <span className="block text-[12px] font-medium text-slate-700">
                    {attachmentLabelMap[type].label}
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    {attachmentLabelMap[type].hint}
                  </span>
                  <input
                    type="file"
                    accept={
                      type === 'image'
                        ? 'image/*'
                        : type === 'audio'
                          ? 'audio/*'
                          : type === 'video'
                            ? 'video/*'
                            : '.pdf,.doc,.docx,.csv,.xlsx,.txt'
                    }
                    className="hidden"
                    multiple={type !== 'file'}
                    onChange={(event) => handleAttachmentPick(type, event.target.files)}
                  />
                </label>
              ))}
            </div>
          </div>
          {attachments.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">{attachmentDetails}</div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default TypeNotesPage;
