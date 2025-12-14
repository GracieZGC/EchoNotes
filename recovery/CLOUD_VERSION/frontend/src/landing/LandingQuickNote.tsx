import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RichNoteEditor, { type RichNoteContent } from '../components/RichNoteEditor';

const QUICK_NOTE_STORAGE_KEY = 'quick-note-draft';

const saveDraftToSession = (content: RichNoteContent) => {
  if (typeof window === 'undefined') return;
  try {
    const payload = {
      html: content.html,
      plainText: content.plainText,
      createdAt: Date.now()
    };
    window.sessionStorage.setItem(QUICK_NOTE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 忽略存储错误，避免影响正常流程
  }
};

export const getQuickNoteDraft = (): RichNoteContent | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(QUICK_NOTE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { html?: string; plainText?: string };
    return {
      html: parsed.html || '',
      plainText: parsed.plainText || ''
    };
  } catch {
    return null;
  }
};

const LandingQuickNote: React.FC = () => {
  const navigate = useNavigate();
  const [charCount, setCharCount] = useState(0);
  const [showLimitModal, setShowLimitModal] = useState(false);

  const maxLength = 200;

  const limitText = useMemo(
    () => `已输入 ${charCount} / ${maxLength} 字`,
    [charCount, maxLength]
  );

  const handleChange = (content: RichNoteContent) => {
    const length = content.plainText.trim().length;
    setCharCount(length);
  };

  const handleMaxLengthExceed = (content: RichNoteContent) => {
    saveDraftToSession(content);
    setShowLimitModal(true);
  };

  const handleGoToFullPage = () => {
    setShowLimitModal(false);
    navigate('/typenotes');
  };

  return (
    <div className="mt-10 max-w-xl rounded-3xl bg-white/90 p-5 shadow-xl shadow-[#d0e9ff]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">快速记一个想法</h3>
          <p className="text-xs text-slate-500 mt-1">
            支持粘贴带格式内容，超出 200 字将引导你到完整记笔记页面
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const emptyContent: RichNoteContent = { html: '', plainText: '' };
            saveDraftToSession(emptyContent);
            navigate('/typenotes');
          }}
          className="shrink-0 rounded-full border border-[#9de8dd] px-3 py-1 text-xs font-medium text-[#0a6154] hover:bg-[#eef6fd] transition-colors"
        >
          打开完整页
        </button>
      </div>

      <RichNoteEditor
        compact
        placeholder="在这里快速记录灵感，支持粘贴标题、列表、代码块等内容…"
        maxPlainTextLength={maxLength}
        onChange={handleChange}
        onMaxLengthExceed={handleMaxLengthExceed}
      />

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>{limitText}</span>
        <span>超过限制将跳转到完整编辑页</span>
      </div>

      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h4 className="text-sm font-semibold text-slate-900">
              内容有点长，建议在完整笔记页编辑
            </h4>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              当前输入内容已接近或超过 200 字，为了获得更好的编辑体验，我们建议你在「完整记笔记」页面继续撰写。
              已为你保留当前内容。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLimitModal(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleGoToFullPage}
                className="rounded-lg bg-[#06c3a8] px-4 py-1.5 text-xs font-medium text-white shadow-md shadow-[#8de2d5] hover:bg-[#04b094]"
              >
                前往完整笔记页
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingQuickNote;

