import React from 'react';
import type { FieldTemplateField, FieldTemplateSource } from '../types/fieldTemplate';

interface FieldTemplateModalProps {
  isOpen: boolean;
  sourceType: FieldTemplateSource;
  notebookName?: string | null;
  fields: FieldTemplateField[];
  loading: boolean;
  saving: boolean;
  error?: string | null;
  hasChanges: boolean;
  onClose: () => void;
  onToggleField: (fieldKey: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onReset: () => void;
  onSave: () => Promise<void> | void;
}

const sourceLabels: Record<FieldTemplateSource, string> = {
  link: '解析链接',
  manual: '键入笔记'
};

const FieldTemplateModal: React.FC<FieldTemplateModalProps> = ({
  isOpen,
  sourceType,
  notebookName,
  fields,
  loading,
  saving,
  error,
  hasChanges,
  onClose,
  onToggleField,
  onSelectAll,
  onClearAll,
  onReset,
  onSave
}) => {
  if (!isOpen) return null;

  const sortedFields = [...fields].sort((a, b) => a.order - b.order);
  const allowActions = !loading && !saving;

  const handleSaveClick = async () => {
    try {
      await onSave();
    } catch (err) {
      console.error('❌ 保存字段模板失败:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">字段模板 · {sourceLabels[sourceType]}</h2>
            <p className="text-xs text-slate-500 mt-1">选择笔记本后，可勾选需要保留的字段；下次解析将按照此模板执行。</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-medium text-slate-700">上一次组件选择如下</p>
            <p className="text-xs text-slate-500 mt-1">
              {notebookName ? `用了此配置的笔记本：${notebookName}` : '正在加载上一次使用的笔记本...'}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>字段勾选</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-100"
                disabled={!allowActions}
                onClick={onSelectAll}
              >
                全选
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-100"
                disabled={!allowActions}
                onClick={onClearAll}
              >
                全不选
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1 hover:bg-slate-100"
                disabled={!allowActions}
                onClick={onReset}
              >
                恢复默认
              </button>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              加载字段模板中...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {sortedFields.map((field) => (
                <label
                  key={field.key}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm shadow-sm transition-colors ${
                    field.enabled !== false
                      ? 'border-[#b5ece0] bg-[#eef6fd] text-[#062b23]'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={field.enabled !== false}
                    disabled={!allowActions}
                    onChange={() => onToggleField(field.key)}
                    className="h-4 w-4 rounded border-slate-300 text-[#0a917a] focus:ring-[#43ccb0]"
                  />
                  <span>{field.label}</span>
                </label>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <div className="text-xs text-slate-500">
            {hasChanges ? '有未保存的更改' : '模板已保存'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              onClick={onClose}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#06c3a8] px-4 py-2 text-sm font-medium text-white shadow-lg shadow-[#8de2d5] disabled:cursor-not-allowed disabled:bg-slate-400"
              onClick={handleSaveClick}
              disabled={!hasChanges || saving || loading}
            >
              {saving ? '保存中...' : '保存模板'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FieldTemplateModal;
