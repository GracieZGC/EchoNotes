import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import apiClient, { getNotebooks, Notebook as ApiNotebook } from '../apiClient';
import { AnalysisResult, NotebookType, SelectedNotes } from '../types/Analysis';
import { getAnalysisUrl } from '../utils/analysisId';

// 分析组件类型
type AnalysisComponent = 'chart' | 'insight' | 'summary' | 'trend';

type ChartConfigState = {
  chartType: 'line' | 'bar' | 'pie' | 'scatter' | 'area';
  title: string;
  xAxisField: string;
  yAxisField: string;
  dataPointField?: string;
  hoverCardFields: string[];
  customFields: Array<{ name: string; type: string; origin?: string }>;
};

interface AnalysisComponentOption {
  id: AnalysisComponent;
  label: string;
  description: string;
  icon: string;
}

const ANALYSIS_COMPONENTS: AnalysisComponentOption[] = [
  {
    id: 'chart',
    label: '数据图表',
    description: '可视化数据趋势和分布',
    icon: '📊'
  },
  {
    id: 'insight',
    label: '智能洞察',
    description: 'AI生成的深度分析洞察',
    icon: '💡'
  },
  {
    id: 'summary',
    label: '摘要总结',
    description: '自动生成内容摘要',
    icon: '📝'
  },
  {
    id: 'trend',
    label: '趋势分析',
    description: '识别时间序列中的模式和趋势',
    icon: '📈'
  }
];

const DEFAULT_AI_PROMPT = `你是一名个人笔记分析助手。请基于用户选定的笔记内容和其中记录的字段，输出以下三部分：

1. 一句话总结：以"所选笔记主要描述……"开头，概括笔记的核心主题或结论。
2. 笔记要点：列出 2‑3 条最重要的信息、结论或数据支撑。
3. 延伸方向：给出 1‑2 个可继续探索或实践的相关思路、问题或行动建议。`;

// 第一步：选择笔记本
const Step1SelectNotebook: React.FC<{
  notebooks: ApiNotebook[];
  selectedNotebookId: string | null;
  onSelect: (notebookId: string) => void;
  onNext: () => void;
}> = ({ notebooks, selectedNotebookId, onSelect, onNext }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredNotebooks = notebooks.filter(notebook =>
    notebook.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    notebook.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getNotebookTypeColor = (type?: NotebookType) => {
    const colorMap: Record<NotebookType, string> = {
      'mood': 'bg-pink-100 text-pink-800 border-pink-200',
      'life': 'bg-green-100 text-green-800 border-green-200',
      'study': 'bg-blue-100 text-blue-800 border-blue-200',
      'work': 'bg-orange-100 text-orange-800 border-orange-200',
      'custom': 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colorMap[type || 'custom'] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getNotebookTypeLabel = (type?: NotebookType) => {
    const labelMap: Record<NotebookType, string> = {
      'mood': '心情',
      'life': '生活',
      'study': '学习',
      'work': '工作',
      'custom': '自定义'
    };
    return labelMap[type || 'custom'] || '自定义';
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">选择笔记本</h2>
        <p className="text-gray-600">选择要分析的笔记本</p>
      </div>

      {/* 搜索框 */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="搜索笔记本..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 pl-10 border border-[#90e2d0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#43ccb0] focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* 笔记本列表 */}
      <div className="space-y-3 mb-6">
        {filteredNotebooks.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>没有找到匹配的笔记本</p>
          </div>
        ) : (
          filteredNotebooks.map((notebook) => {
            const isSelected = selectedNotebookId === notebook.notebook_id;
            return (
              <button
                key={notebook.notebook_id}
                onClick={() => onSelect(notebook.notebook_id)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-[#43ccb0] bg-[#eef6fd] shadow-md'
                    : 'border-gray-200 bg-white hover:border-[#90e2d0] hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {notebook.name}
                      </h3>
                      {notebook.type && (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getNotebookTypeColor(notebook.type)}`}>
                          {getNotebookTypeLabel(notebook.type)}
                        </span>
                      )}
                    </div>
                    {notebook.description && (
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                        {notebook.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>📝 {notebook.note_count || 0} 条笔记</span>
                      <span>
                        {new Date(notebook.created_at).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="ml-4 flex-shrink-0">
                      <div className="w-6 h-6 rounded-full bg-[#eef6fd]0 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* 下一步按钮 */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!selectedNotebookId}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            selectedNotebookId
              ? 'bg-[#06c3a8] text-white hover:bg-[#04b094] shadow-lg shadow-[#8de2d5]'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          下一步
        </button>
      </div>
    </div>
  );
};

// 第二步：选择笔记和日期范围
const Step2SelectNotes: React.FC<{
  notebookId: string | null;
  notebooks: ApiNotebook[];
  selectedNoteIds: string[];
  dateRange: { from: string; to: string };
  onNotebookSelect: (notebookId: string) => void;
  onNoteToggle: (noteId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDateRangeChange: (range: { from: string; to: string }) => void;
  onBack: () => void;
  onNext: () => void;
}> = ({
  notebookId,
  notebooks,
  selectedNoteIds,
  dateRange,
  onNotebookSelect,
  onNoteToggle,
  onSelectAll,
  onDeselectAll,
  onDateRangeChange,
  onBack,
  onNext
}) => {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notebook, setNotebook] = useState<ApiNotebook | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [notebookDropdownOpen, setNotebookDropdownOpen] = useState(false);
  const [hoveredNotebookId, setHoveredNotebookId] = useState<string | null>(null);
  const notebookDropdownRef = useRef<HTMLDivElement | null>(null);
  const notebookTriggerRef = useRef<HTMLButtonElement | null>(null);
  const notebookMenuRef = useRef<HTMLDivElement | null>(null);
  const [notebookMenuPos, setNotebookMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const loadNotes = async () => {
      if (!notebookId) {
        setLoading(false);
        setNotes([]);
        setNotebook(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        console.log('📝 [Step2SelectNotes] 开始加载笔记，notebookId:', notebookId);
        const response = await apiClient.getNotes(notebookId);
        console.log('📝 [Step2SelectNotes] 加载笔记成功:', {
          notebook: response.notebook?.name,
          notesCount: response.notes?.length || 0
        });
        setNotes(response.notes || []);
        setNotebook(response.notebook);
        // 如果返回了空数组，清除之前的错误
        if ((response.notes || []).length === 0) {
          setError(null);
        }
      } catch (err: any) {
        console.error('❌ [Step2SelectNotes] 加载笔记失败:', err);
        // 提取错误信息
        let errorMessage = '加载笔记失败';
        if (err.response?.data) {
          const errorData = err.response.data;
          if (typeof errorData === 'string') {
            try {
              const parsed = JSON.parse(errorData);
              errorMessage = parsed.error || parsed.message || errorMessage;
            } catch {
              errorMessage = errorData;
            }
          } else if (errorData.error) {
            errorMessage = errorData.error;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } else if (err.message) {
          errorMessage = err.message;
        }
        setError(errorMessage);
        // 发生错误时，清空笔记列表，避免显示旧数据
        setNotes([]);
        setNotebook(null);
      } finally {
        setLoading(false);
      }
    };

    loadNotes();
  }, [notebookId]);

  // 根据日期范围过滤笔记
  const filteredNotes = notes.filter(note => {
    const noteDate = new Date(note.created_at);
    const fromDate = dateRange.from ? new Date(dateRange.from) : null;
    const toDate = dateRange.to ? new Date(dateRange.to) : null;

    if (fromDate && noteDate < fromDate) return false;
    if (toDate && noteDate > toDate) return false;
    return true;
  });

  // 自动选择所有过滤后的笔记（仅在首次加载时）
  useEffect(() => {
    if (!loading && filteredNotes.length > 0 && selectedNoteIds.length === 0 && !initialLoadDone) {
      // 默认选择所有过滤后的笔记
      const allFilteredIds = filteredNotes.map(note => note.note_id);
      allFilteredIds.forEach(noteId => {
        onNoteToggle(noteId);
      });
      setInitialLoadDone(true);
    }
  }, [loading, filteredNotes.length, selectedNoteIds.length, initialLoadDone]);

  // 检查是否全选
  const isAllSelected = filteredNotes.length > 0 && filteredNotes.every(note => selectedNoteIds.includes(note.note_id));

  // 处理全选切换
  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      // 取消全选
      selectedNoteIds.forEach(noteId => {
        if (filteredNotes.some(note => note.note_id === noteId)) {
          onNoteToggle(noteId);
        }
      });
    } else {
      // 全选
      filteredNotes.forEach(note => {
        if (!selectedNoteIds.includes(note.note_id)) {
          onNoteToggle(note.note_id);
        }
      });
    }
  };

  // 重置筛选
  const handleReset = () => {
    onDateRangeChange({ from: '', to: '' });
  };

  // 下拉菜单定位逻辑
  const updateNotebookMenuPos = useCallback(() => {
    if (!notebookTriggerRef.current) return;
    const rect = notebookTriggerRef.current.getBoundingClientRect();
    setNotebookMenuPos({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width
    });
  }, []);

  // 点击外部关闭下拉框
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

  // 更新下拉菜单位置
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#eef6fd] via-[#eef6fd] to-[#eef6fd] py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#06c3a8] mx-auto mb-4"></div>
            <p className="text-gray-600">加载笔记中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef6fd] via-[#eef6fd] to-[#eef6fd] py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 顶部错误提示 */}
        {error && (
          <div className="w-full bg-red-50 border-2 border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-red-700">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">HTTP 500: {error}</span>
            </div>
          </div>
        )}

        {/* 选择笔记本卡片 */}
        <div className="bg-white rounded-2xl p-6 shadow-lg shadow-[#c4f1e5] border border-[#d4f3ed]" style={{ boxShadow: '0 0 0 1px rgba(139, 92, 246, 0.1), 0 20px 25px -5px rgba(139, 92, 246, 0.1)' }}>
          <h2 className="text-xl font-bold text-gray-900 mb-4" style={{ fontSize: '18px', lineHeight: '1.6', letterSpacing: '0.2px' }}>选择笔记本</h2>
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1" ref={notebookDropdownRef}>
              <button
                ref={notebookTriggerRef}
                type="button"
                onClick={() => setNotebookDropdownOpen(!notebookDropdownOpen)}
                className={`w-full px-4 py-2 text-left rounded-full flex items-center justify-between transition-all duration-200 ${
                  notebookDropdownOpen
                    ? 'border-2 border-[#43ccb0] shadow-md shadow-[#c4f1e5] bg-gradient-to-r from-[#eef6fd] to-[#d4f3ed]'
                    : 'border border-[#90e2d0] bg-gradient-to-r from-[#eef6fd]/50 to-white hover:border-[#6bd8c0] hover:shadow-sm'
                }`}
                style={{ fontSize: '14px', lineHeight: '1.6', letterSpacing: '0.2px' }}
              >
                <span className={`transition-colors ${notebookDropdownOpen ? 'text-[#0a6154] font-medium' : 'text-[#0a917a]'}`}>
                  {notebook ? `${notebook.name} (${notes.length}条笔记)` : notebooks.length === 0 ? '暂无笔记本，请先创建。' : '请选择笔记本'}
                </span>
                <svg
                  className={`w-4 h-4 ml-2 transition-transform duration-200 flex-shrink-0 ${notebookDropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  style={{ color: notebookDropdownOpen ? '#9333ea' : '#a855f7' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {notebookDropdownOpen && notebookMenuPos && createPortal(
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
                    boxShadow: '0 10px 25px -5px rgba(139, 92, 246, 0.2), 0 0 0 1px rgba(139, 92, 246, 0.1)'
                  }}
                >
                  <div className="p-2">
                    {notebooks.length === 0 ? (
                      <div className="px-4 py-3 text-gray-500 text-center" style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}>
                        暂无笔记本，请先创建。
                      </div>
                    ) : (
                      notebooks.map((nb) => {
                        const isSelected = notebook?.notebook_id === nb.notebook_id;
                        const isHovered = hoveredNotebookId === nb.notebook_id;
                        const shouldHighlight = isHovered || (!hoveredNotebookId && isSelected);
                        // 如果当前选中的笔记本，使用实际加载的笔记数量；否则使用 note_count
                        const noteCount = isSelected ? notes.length : (nb.note_count || 0);
                        return (
                          <button
                            key={nb.notebook_id}
                            type="button"
                            onClick={() => {
                              onNotebookSelect(nb.notebook_id);
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
                            style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                          >
                            <div className="flex items-center justify-between">
                              <span>{nb.name}</span>
                              <span className="text-gray-500 ml-2" style={{ fontSize: '12px' }}>({noteCount}条笔记)</span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>,
                document.body
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-gray-600 whitespace-nowrap" style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.2px' }}>高级筛选</span>
              <button
                onClick={() => setAdvancedFilterOpen(!advancedFilterOpen)}
                className="px-4 py-2 font-medium text-[#0a6154] bg-white rounded-lg hover:bg-[#eef6fd] transition-colors border border-[#b5ece0] whitespace-nowrap"
                style={{ fontSize: '13px', lineHeight: '1.4', letterSpacing: '0.2px' }}
              >
                更多筛选
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 font-medium text-white bg-[#06c3a8] rounded-lg hover:bg-[#04b094] transition-colors whitespace-nowrap"
                style={{ fontSize: '13px', lineHeight: '1.4', letterSpacing: '0.2px' }}
              >
                重置
              </button>
              <button
                onClick={() => setAdvancedFilterOpen(!advancedFilterOpen)}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              >
                <svg className={`w-5 h-5 transition-transform ${advancedFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* 高级筛选展开区域 */}
          {advancedFilterOpen && notebook && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-gray-700 mb-2" style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.2px' }}>开始日期</label>
                  <input
                    type="date"
                    value={dateRange.from}
                    onChange={(e) => onDateRangeChange({ ...dateRange, from: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#43ccb0] focus:border-transparent"
                    style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.1px' }}
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 mb-2" style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.2px' }}>结束日期</label>
                  <input
                    type="date"
                    value={dateRange.to}
                    onChange={(e) => onDateRangeChange({ ...dateRange, to: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#43ccb0] focus:border-transparent"
                    style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.1px' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 笔记列表卡片 */}
        <div className="bg-white rounded-2xl p-6 shadow-lg shadow-[#c4f1e5] border border-[#d4f3ed]" style={{ boxShadow: '0 0 0 1px rgba(139, 92, 246, 0.1), 0 20px 25px -5px rgba(139, 92, 246, 0.1)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900" style={{ fontSize: '18px', lineHeight: '1.6', letterSpacing: '0.2px' }}>笔记列表</h3>
            <div className="flex items-center gap-6" style={{ fontSize: '12px', lineHeight: '1.4', letterSpacing: '0.2px' }}>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">已选择:</span>
                <span className="font-bold text-[#0a917a]">{selectedNoteIds.length}</span>
                <span className="text-gray-400">条</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">筛选后:</span>
                <span className="font-bold text-[#0a917a]">{filteredNotes.length}</span>
                <span className="text-gray-400">条</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">总计:</span>
                <span className="font-bold text-[#0a917a]">{notes.length}</span>
                <span className="text-gray-400">条</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAllToggle}
                    disabled={filteredNotes.length === 0}
                    className="sr-only peer"
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors ${
                    filteredNotes.length === 0
                      ? 'bg-gray-300 cursor-not-allowed'
                      : isAllSelected
                        ? 'bg-[#06c3a8]'
                        : 'bg-gray-300'
                  }`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform mt-0.5 ml-0.5 ${
                      isAllSelected
                        ? 'translate-x-5'
                        : 'translate-x-0'
                    }`}></div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* 笔记列表 */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {loading ? (
              <div className="text-center py-12 text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#06c3a8] mx-auto mb-4"></div>
                <p>加载笔记中...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12 text-red-500">
                <p className="mb-4">⚠️ {error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    // 重新加载笔记
                    const loadNotes = async () => {
                      if (!notebookId) return;
                      try {
                        setLoading(true);
                        const response = await apiClient.getNotes(notebookId);
                        setNotes(response.notes || []);
                        setNotebook(response.notebook);
                      } catch (err: any) {
                        console.error('重新加载笔记失败:', err);
                        setError(err.message || '加载笔记失败');
                      } finally {
                        setLoading(false);
                      }
                    };
                    loadNotes();
                  }}
                  className="px-4 py-2 text-sm text-white bg-[#06c3a8] rounded-lg hover:bg-[#04b094] transition-colors"
                >
                  重试
                </button>
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="mb-4">暂无笔记，请先创建。</p>
                {!notebook && (
                  <button
                    onClick={onBack}
                    className="px-4 py-2 text-sm text-[#0a6154] bg-[#eef6fd] rounded-lg hover:bg-[#d4f3ed] transition-colors border border-[#b5ece0]"
                  >
                    去创建笔记本
                  </button>
                )}
              </div>
            ) : (
              filteredNotes.map((note) => {
                const isSelected = selectedNoteIds.includes(note.note_id);
                return (
                  <button
                    key={note.note_id}
                    onClick={() => onNoteToggle(note.note_id)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-[#43ccb0] bg-[#eef6fd] shadow-sm'
                        : 'border-gray-200 bg-white hover:border-[#90e2d0]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isSelected
                          ? 'border-[#43ccb0] bg-[#eef6fd]0'
                          : 'border-gray-300 bg-white'
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 mb-2 truncate" style={{ fontSize: '14px', lineHeight: '1.7', letterSpacing: '0.2px' }}>
                          {note.title || '无标题'}
                        </h4>
                        <div className="text-gray-500" style={{ fontSize: '12px', lineHeight: '1.6', letterSpacing: '0.1px' }}>
                          {formatDate(note.created_at)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 底部操作区 */}
        <div className="flex justify-end gap-4">
          <button
            onClick={onBack}
            className="px-6 py-3 rounded-full font-medium text-[#0a6154] bg-white border-2 border-gray-200 hover:border-[#90e2d0] hover:bg-[#eef6fd] transition-colors"
            style={{ fontSize: '12px', lineHeight: '1.5', letterSpacing: '0.2px' }}
          >
            返回
          </button>
          <button
            onClick={onNext}
            disabled={selectedNoteIds.length === 0}
            className={`px-6 py-3 rounded-full font-medium transition-colors ${
              selectedNoteIds.length > 0
                ? 'bg-[#06c3a8] text-white hover:bg-[#04b094] shadow-lg shadow-[#8de2d5]'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            style={{ fontSize: '12px', lineHeight: '1.5', letterSpacing: '0.2px' }}
          >
            下一步
          </button>
        </div>
      </div>
    </div>
  );
};

// 第三步：分析配置页面
const Step3SelectMode: React.FC<{
  selectedComponents: AnalysisComponent[];
  onComponentToggle: (component: AnalysisComponent) => void;
  mode: 'ai' | 'custom';
  onModeChange: (mode: 'ai' | 'custom') => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  notebookId: string | null;
  selectedNoteIds: string[];
  dateRange: { from: string; to: string };
  onChartConfigChange?: (config: ChartConfigState) => void;
  prefillChartConfig?: Partial<ChartConfigState> | null;
  initialAIPrompt?: string | null;
  onPromptChange?: (prompt: string) => void;
}> = ({
  selectedComponents,
  onComponentToggle,
  mode,
  onModeChange,
  onBack,
  onSubmit,
  isSubmitting,
  notebookId,
  selectedNoteIds,
  dateRange,
  onChartConfigChange,
  prefillChartConfig,
  initialAIPrompt,
  onPromptChange
}) => {
  // 图表配置状态
  const [enabledChart, setEnabledChart] = useState(selectedComponents.includes('chart'));
  const [openChart, setOpenChart] = useState(true);
  const [currentChartType, setCurrentChartType] = useState<'line' | 'bar' | 'pie' | 'scatter' | 'area'>('line');
  const [currentTitle, setCurrentTitle] = useState('');
  const [currentXAxis, setCurrentXAxis] = useState('');
  const [currentYAxis, setCurrentYAxis] = useState('');
  const [currentPointField, setCurrentPointField] = useState('');
  const [currentTooltipFields, setCurrentTooltipFields] = useState<string[]>([]);
  
  // AI配置状态
  const [enabledAI, setEnabledAI] = useState(selectedComponents.includes('insight'));
  const [openAI, setOpenAI] = useState(true);
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_AI_PROMPT);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [promptTemplate, setPromptTemplate] = useState('');
  const [promptTitle, setPromptTitle] = useState('通用分析');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [promptTitleDropdownOpen, setPromptTitleDropdownOpen] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<Array<{ id: string; title: string; content: string }>>([
    { id: 'default', title: '通用分析', content: DEFAULT_AI_PROMPT }
  ]);
  const [currentTemplateId, setCurrentTemplateId] = useState('default');
  
  // 字段相关状态
  const [existingFields, setExistingFields] = useState<Array<{ name: string; type: string; selectable: boolean; id?: string }>>([]);
  const [fieldNameToIdMap, setFieldNameToIdMap] = useState<Record<string, string>>({});
  const [customFields, setCustomFields] = useState<Array<{ name: string; type: string; origin?: string }>>([]);
  const [customFieldName, setCustomFieldName] = useState('');
  const [customFieldType, setCustomFieldType] = useState<'string' | 'number' | 'date' | 'boolean'>('string');
  const [isGeneratingField, setIsGeneratingField] = useState(false);

  // 组件ID -> 展示名称的映射，便于把历史配置中的字段ID回填为可读名称
  const fieldIdToNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    existingFields.forEach((f) => {
      if (f.id) {
        map[f.id] = f.name;
      }
    });
    return map;
  }, [existingFields]);

  // 是否已加载过字段列表（existing/custom）
  const hasLoadedAnyField = useMemo(
    () => existingFields.length > 0 || customFields.length > 0,
    [existingFields, customFields]
  );

  // 将存储值转换为展示名（支持字段ID → 字段标题）
  const resolveFieldValue = useCallback(
    (value: string) => {
      if (!value) return '';
      if (fieldIdToNameMap[value]) return fieldIdToNameMap[value];
      return value;
    },
    [fieldIdToNameMap]
  );

  // 从图表配置中解析出字段（兼容 fieldMappings 为数组/对象的情况）
  const buildPrefillFromChartConfig = useCallback(
    (chartConfig: any): Partial<ChartConfigState> | null => {
      if (!chartConfig) return null;

      const mappingArray = Array.isArray(chartConfig.fieldMappings)
        ? chartConfig.fieldMappings
        : chartConfig.fieldMappings && typeof chartConfig.fieldMappings === 'object'
          ? Object.values(chartConfig.fieldMappings)
          : [];

      const resolveWithMappings = (rawValue: string, role?: string) => {
        const value = rawValue || '';
        if (mappingArray.length > 0) {
          const byRole = role ? mappingArray.find((m: any) => m?.role === role) : null;
          const byValue = mappingArray.find((m: any) =>
            [m?.id, m?.sourceField, m?.targetField, m?.name, m?.fieldId].filter(Boolean).includes(value)
          );
          const candidate = byRole || byValue;
          const mapped =
            candidate?.finalConfig?.targetField ||
            candidate?.targetField ||
            candidate?.name ||
            candidate?.label ||
            candidate?.sourceField ||
            candidate?.fieldId;
          if (mapped) {
            return resolveFieldValue(mapped);
          }
        }
        return resolveFieldValue(value);
      };

      const resolveHoverFields = (rawHover: any) => {
        if (Array.isArray(rawHover) && rawHover.length > 0) {
          return rawHover.map((item: any) => resolveWithMappings(item, 'tooltip')).filter(Boolean);
        }
        if (mappingArray.length > 0) {
          const tooltipMappings = mappingArray.filter((m: any) => m?.role === 'tooltip');
          if (tooltipMappings.length > 0) {
            return tooltipMappings
              .map((m: any) =>
                resolveWithMappings(m?.targetField || m?.name || m?.sourceField || '', 'tooltip')
              )
              .filter(Boolean);
          }
        }
        return [];
      };

      return {
        chartType: chartConfig.chartType || chartConfig.type || 'line',
        title: chartConfig.title || '',
        xAxisField: resolveWithMappings(chartConfig.xAxisField || chartConfig.xField || chartConfig.xAxis, 'x'),
        yAxisField: resolveWithMappings(chartConfig.yAxisField || chartConfig.yField || chartConfig.yAxis, 'y'),
        dataPointField: resolveWithMappings(chartConfig.dataPointField || chartConfig.pointField, 'point'),
        hoverCardFields: resolveHoverFields(chartConfig.hoverCardFields || chartConfig.tooltipFields),
        customFields: chartConfig.customFields || []
      };
    },
    [resolveFieldValue]
  );
  
  // X轴下拉菜单状态
  const [xAxisDropdownOpen, setXAxisDropdownOpen] = useState(false);
  const [hoveredXAxisOption, setHoveredXAxisOption] = useState<string | null>(null);
  const xAxisDropdownRef = useRef<HTMLDivElement | null>(null);
  const xAxisTriggerRef = useRef<HTMLButtonElement | null>(null);
  const xAxisMenuRef = useRef<HTMLDivElement | null>(null);
  const [xAxisMenuPos, setXAxisMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Y轴下拉菜单状态
  const [yAxisDropdownOpen, setYAxisDropdownOpen] = useState(false);
  const [hoveredYAxisOption, setHoveredYAxisOption] = useState<string | null>(null);
  const yAxisDropdownRef = useRef<HTMLDivElement | null>(null);
  const yAxisTriggerRef = useRef<HTMLButtonElement | null>(null);
  const yAxisMenuRef = useRef<HTMLDivElement | null>(null);
  const [yAxisMenuPos, setYAxisMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // 数据点下拉菜单状态
  const [pointDropdownOpen, setPointDropdownOpen] = useState(false);
  const [hoveredPointOption, setHoveredPointOption] = useState<string | null>(null);
  const pointDropdownRef = useRef<HTMLDivElement | null>(null);
  const pointTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pointMenuRef = useRef<HTMLDivElement | null>(null);
  const [pointMenuPos, setPointMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // 悬浮提示下拉菜单状态
  const [tooltipDropdownOpen, setTooltipDropdownOpen] = useState(false);
  const [hoveredTooltipOption, setHoveredTooltipOption] = useState<string | null>(null);
  const tooltipDropdownRef = useRef<HTMLDivElement | null>(null);
  const tooltipTriggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipMenuRef = useRef<HTMLDivElement | null>(null);
  const [tooltipMenuPos, setTooltipMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // 自定义字段类型下拉菜单状态
  const [customFieldTypeDropdownOpen, setCustomFieldTypeDropdownOpen] = useState(false);
  const customFieldTypeButtonRef = useRef<HTMLButtonElement>(null);
  const [customFieldTypeMenuPos, setCustomFieldTypeMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [prefillApplied, setPrefillApplied] = useState(false);
  
  const chartTypeLabelMap: Record<string, string> = {
    line: '折线图',
    bar: '柱状图',
    pie: '饼图',
    scatter: '散点图',
    area: '面积图'
  };
  
  const customFieldTypeOptions = [
    { value: 'string', label: '文本' },
    { value: 'number', label: '数字' },
    { value: 'date', label: '日期' },
    { value: 'boolean', label: '布尔值' }
  ];
  
  // 获取字段显示名称
  const getFieldDisplayName = (value: string): string => {
    if (!value) return '';
    const field = existingFields.find(f => f.name === value);
    if (field) return field.name;
    const custom = customFields.find(f => f.name === value);
    if (custom) return custom.name;
    return value;
  };
  
  // 获取坐标轴选项
  const getAxisOptions = useCallback(() => {
    const options: Array<{ value: string; label: string }> = [];
    // 所有现有字段都可以选择（不排除任何字段）
    existingFields.forEach(f => {
      options.push({ value: f.name, label: f.name });
    });
    customFields.forEach(f => {
      options.push({ value: f.name, label: f.name });
    });
    return options;
  }, [existingFields, customFields]);
  
  // X轴下拉菜单定位逻辑
  const updateXAxisMenuPos = useCallback(() => {
    if (!xAxisTriggerRef.current) return;
    const rect = xAxisTriggerRef.current.getBoundingClientRect();
    setXAxisMenuPos({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width
    });
  }, []);

  // Y轴下拉菜单定位逻辑
  const updateYAxisMenuPos = useCallback(() => {
    if (!yAxisTriggerRef.current) return;
    const rect = yAxisTriggerRef.current.getBoundingClientRect();
    setYAxisMenuPos({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width
    });
  }, []);

  // 数据点下拉菜单定位逻辑
  const updatePointMenuPos = useCallback(() => {
    if (!pointTriggerRef.current) return;
    const rect = pointTriggerRef.current.getBoundingClientRect();
    setPointMenuPos({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width
    });
  }, []);

  // 悬浮提示下拉菜单定位逻辑
  const updateTooltipMenuPos = useCallback(() => {
    if (!tooltipTriggerRef.current) return;
    const rect = tooltipTriggerRef.current.getBoundingClientRect();
    setTooltipMenuPos({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width
    });
  }, []);
  
  // X轴下拉菜单：点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        xAxisDropdownRef.current &&
        !xAxisDropdownRef.current.contains(event.target as Node) &&
        (!xAxisMenuRef.current || !xAxisMenuRef.current.contains(event.target as Node))
      ) {
        setXAxisDropdownOpen(false);
      }
    };
    if (xAxisDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [xAxisDropdownOpen]);

  // X轴下拉菜单：更新位置
  useEffect(() => {
    if (!xAxisDropdownOpen) {
      setXAxisMenuPos(null);
      setHoveredXAxisOption(null);
      return;
    }
    updateXAxisMenuPos();
    const handler = () => updateXAxisMenuPos();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [xAxisDropdownOpen, updateXAxisMenuPos]);

  // Y轴下拉菜单：点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        yAxisDropdownRef.current &&
        !yAxisDropdownRef.current.contains(event.target as Node) &&
        (!yAxisMenuRef.current || !yAxisMenuRef.current.contains(event.target as Node))
      ) {
        setYAxisDropdownOpen(false);
      }
    };
    if (yAxisDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [yAxisDropdownOpen]);

  // Y轴下拉菜单：更新位置
  useEffect(() => {
    if (!yAxisDropdownOpen) {
      setYAxisMenuPos(null);
      setHoveredYAxisOption(null);
      return;
    }
    updateYAxisMenuPos();
    const handler = () => updateYAxisMenuPos();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [yAxisDropdownOpen, updateYAxisMenuPos]);

  // 数据点下拉菜单：点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pointDropdownRef.current &&
        !pointDropdownRef.current.contains(event.target as Node) &&
        (!pointMenuRef.current || !pointMenuRef.current.contains(event.target as Node))
      ) {
        setPointDropdownOpen(false);
      }
    };
    if (pointDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [pointDropdownOpen]);

  // 数据点下拉菜单：更新位置
  useEffect(() => {
    if (!pointDropdownOpen) {
      setPointMenuPos(null);
      setHoveredPointOption(null);
      return;
    }
    updatePointMenuPos();
    const handler = () => updatePointMenuPos();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [pointDropdownOpen, updatePointMenuPos]);

  // 悬浮提示下拉菜单：点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipDropdownRef.current &&
        !tooltipDropdownRef.current.contains(event.target as Node) &&
        (!tooltipMenuRef.current || !tooltipMenuRef.current.contains(event.target as Node))
      ) {
        setTooltipDropdownOpen(false);
      }
    };
    if (tooltipDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [tooltipDropdownOpen]);

  // 悬浮提示下拉菜单：更新位置
  useEffect(() => {
    if (!tooltipDropdownOpen) {
      setTooltipMenuPos(null);
      setHoveredTooltipOption(null);
      return;
    }
    updateTooltipMenuPos();
    const handler = () => updateTooltipMenuPos();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [tooltipDropdownOpen, updateTooltipMenuPos]);

  // 点击外部关闭标题下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (promptTitleDropdownOpen) {
        const dropdown = document.querySelector('[data-prompt-title-dropdown]');
        if (dropdown && !dropdown.contains(target)) {
          setPromptTitleDropdownOpen(false);
        }
      }
    };
    if (promptTitleDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [promptTitleDropdownOpen]);

  // 外部传入的提示词（例如历史配置）更新时，回填到当前状态
  useEffect(() => {
    if (initialAIPrompt && initialAIPrompt !== customPrompt && !isEditingPrompt) {
      setCustomPrompt(initialAIPrompt);
    }
  }, [initialAIPrompt, customPrompt, isEditingPrompt]);

  // 将最新的提示词同步给父组件，便于提交时使用
  useEffect(() => {
    onPromptChange?.(customPrompt);
  }, [customPrompt, onPromptChange]);

  // 加载笔记本字段
  useEffect(() => {
    const loadFields = async () => {
      if (!notebookId) return;
      try {
        const response = await apiClient.get(`/api/notebooks/${notebookId}`);
        if (response.data?.success && response.data?.notebook?.component_config) {
          let config = response.data.notebook.component_config;
          
          // 如果 component_config 是字符串，需要解析
          if (typeof config === 'string') {
            try {
              config = JSON.parse(config);
            } catch (parseError) {
              console.error('解析 component_config 失败:', parseError);
              return;
            }
          }
          
          const instances = config.componentInstances || [];
          console.info('[Step3] 加载字段', { notebookId, instancesCount: instances.length, instances });
          
          const fields = instances.map((inst: any) => ({
            name: inst.title || inst.type,
            type: inst.type || 'string',
            // 所有字段都可以用于坐标轴选择（不排除任何字段）
            selectable: true,
            id: inst.id
          }));
          
          console.info('[Step3] 处理后的字段', { fields, selectableCount: fields.filter((f: any) => f.selectable).length });
          setExistingFields(fields);
          
          // 构建字段名称到字段 ID 的映射
          const nameToIdMap: Record<string, string> = {};
          instances.forEach((inst: any) => {
            const fieldName = inst.title || inst.type;
            if (inst.id && fieldName) {
              nameToIdMap[fieldName] = inst.id;
            }
          });
          setFieldNameToIdMap(nameToIdMap);
        } else {
          console.warn('[Step3] 未找到 component_config', { notebookId, response: response.data });
        }
      } catch (error) {
        console.error('加载字段失败:', error);
      }
    };
    loadFields();
  }, [notebookId]);
  
  // 监听组件选择变化，同步选框状态
  useEffect(() => {
    const shouldEnableChart = selectedComponents.includes('chart');
    const shouldEnableAI = selectedComponents.includes('insight');
    
    // 同步图表选框状态
    setEnabledChart(shouldEnableChart);
    // 同步AI选框状态
    setEnabledAI(shouldEnableAI);
    
    // 如果图表组件被选中，确保图表配置面板展开
    if (shouldEnableChart) {
      setOpenChart(true);
    }
    // 如果AI组件被选中，确保AI配置面板展开
    if (shouldEnableAI) {
      setOpenAI(true);
    }
  }, [selectedComponents]);

  // 回填历史图表配置（简化版：直接使用保存的字段名称）
  useEffect(() => {
    // 如果已经应用过或没有配置，跳过
    if (prefillApplied || !prefillChartConfig) {
      if (prefillChartConfig) {
        console.info('[Step3] 跳过回填（已应用）', { prefillApplied, hasPrefill: !!prefillChartConfig });
      }
      return;
    }

    // 等待字段加载完成
    if (!hasLoadedAnyField) {
      console.info('[Step3] 字段尚未加载完成，等待后再回填', {
        existingFields: existingFields.length,
        customFields: customFields.length
      });
      return;
    }
    
    // 检查配置是否有效（至少要有 X 轴或 Y 轴字段）
    if (!prefillChartConfig.xAxisField && !prefillChartConfig.yAxisField) {
      console.warn('[Step3] 配置无效，跳过回填', {
        prefillChartConfig,
        hasXAxis: !!prefillChartConfig.xAxisField,
        hasYAxis: !!prefillChartConfig.yAxisField
      });
      setPrefillApplied(true); // 标记为已应用，避免重复尝试
      return;
    }
    
    console.info('[Step3] 开始回填图表配置', {
      prefillChartConfig,
      existingFieldsCount: existingFields.length,
      customFieldsCount: customFields.length,
      notebookId
    });
    
    // 设置图表类型和标题
    setCurrentChartType(prefillChartConfig.chartType || 'line');
    setCurrentTitle(prefillChartConfig.title || '');
    
    // 直接使用保存的字段名称（保存时保存的就是字段名称）
    // 验证字段是否在当前可用字段列表中
    const allAvailableFields = [
      ...existingFields.map(f => f.name),
      ...customFields.map(f => f.name)
    ];
    
    const xAxisValue = prefillChartConfig.xAxisField || '';
    const yAxisValue = prefillChartConfig.yAxisField || '';
    const dataPointValue = prefillChartConfig.dataPointField || '';
    const hoverCardValues = Array.isArray(prefillChartConfig.hoverCardFields)
      ? prefillChartConfig.hoverCardFields.filter(Boolean)
      : [];
    
    // 验证字段是否存在，如果不存在则清空
    const validatedXAxis = allAvailableFields.includes(xAxisValue) ? xAxisValue : '';
    const validatedYAxis = allAvailableFields.includes(yAxisValue) ? yAxisValue : '';
    const validatedPoint = allAvailableFields.includes(dataPointValue) ? dataPointValue : '';
    const validatedHover = hoverCardValues.filter(f => allAvailableFields.includes(f));
    
    console.info('[Step3] 回填坐标轴配置', {
      xAxisValue: validatedXAxis,
      yAxisValue: validatedYAxis,
      dataPointValue: validatedPoint,
      hoverCardValues: validatedHover,
      original: {
        xAxis: xAxisValue,
        yAxis: yAxisValue,
        point: dataPointValue,
        hover: hoverCardValues
      },
      availableFields: allAvailableFields
    });
    
    // 设置坐标轴值
    setCurrentXAxis(validatedXAxis);
    setCurrentYAxis(validatedYAxis);
    setCurrentPointField(validatedPoint);
    setCurrentTooltipFields(validatedHover);
    
    // 回填自定义字段（如果有）
    if (Array.isArray(prefillChartConfig.customFields)) {
      setCustomFields(prefillChartConfig.customFields);
    }
    
    console.info('[Step3] 回填完成', {
      xAxisField: validatedXAxis,
      yAxisField: validatedYAxis,
      dataPointField: validatedPoint,
      hoverCardFields: validatedHover
    });
    
    setPrefillApplied(true);
  }, [prefillChartConfig, prefillApplied, notebookId, hasLoadedAnyField, existingFields, customFields]);

  // notebook 变化时允许重新回填
  useEffect(() => {
    console.info('[Step3] notebook 变化，重置回填状态', { notebookId, previousPrefillApplied: prefillApplied });
    setPrefillApplied(false);
    // 注意：prefillChartConfig 是由父组件管理的，这里只需要重置 prefillApplied
  }, [notebookId]); // prefillApplied 不需要在依赖项中，因为我们只想在 notebookId 变化时重置
  
  // 当 prefillChartConfig 变化时，如果之前已经应用过，允许重新应用（用于保存后重新加载）
  useEffect(() => {
    if (prefillChartConfig && prefillApplied) {
      // 如果配置变化了，允许重新应用
      console.info('[Step3] 检测到配置变化，允许重新回填', {
        hasPrefill: !!prefillChartConfig,
        prefillApplied
      });
      setPrefillApplied(false);
    }
  }, [prefillChartConfig]);

  // 将当前图表配置同步给父组件用于提交
  useEffect(() => {
    if (!onChartConfigChange) return;
    onChartConfigChange({
      chartType: currentChartType,
      title: currentTitle,
      xAxisField: currentXAxis,
      yAxisField: currentYAxis,
      dataPointField: currentPointField,
      hoverCardFields: currentTooltipFields,
      customFields
    });
  }, [onChartConfigChange, currentChartType, currentTitle, currentXAxis, currentYAxis, currentPointField, currentTooltipFields, customFields]);
  
  // 图表类型变化处理
  const handleChartTypeChange = (type: 'line' | 'bar' | 'pie' | 'scatter' | 'area') => {
    setCurrentChartType(type);
  };
  
  // AI生成字段
  const handleGenerateField = async () => {
    if (!customFieldName.trim() && customFields.length === 0) {
      alert('请输入字段名称或描述');
      return;
    }
    setIsGeneratingField(true);
    try {
      // 模拟AI生成字段
      await new Promise(resolve => setTimeout(resolve, 1000));
      const newField = {
        name: customFieldName.trim() || `AI字段${customFields.length + 1}`,
        type: customFieldType,
        origin: 'ai-generated'
      };
      setCustomFields(prev => [...prev, newField]);
      setCustomFieldName('');
    } catch (error) {
      console.error('生成字段失败:', error);
      alert('生成字段失败，请重试');
    } finally {
      setIsGeneratingField(false);
    }
  };
  
  // 删除自定义字段
  const handleRemoveCustomField = (name: string) => {
    setCustomFields(prev => prev.filter(f => f.name !== name));
    if (currentXAxis === name) setCurrentXAxis('');
    if (currentYAxis === name) setCurrentYAxis('');
    if (currentPointField === name) setCurrentPointField('');
    setCurrentTooltipFields(prev => prev.filter(f => f !== name));
  };
  
  // 保存图表配置（简化版：只保存坐标轴配置）
  const handleSaveChartConfig = async () => {
    if (!notebookId) {
      alert('请先选择笔记本');
      return;
    }
    
    // 验证必填项
    if (!currentXAxis || !currentYAxis) {
      alert('请选择 X 轴和 Y 轴字段');
      return;
    }
    
    try {
      // 构建简化的图表配置（只保存坐标轴相关配置）
      const chartConfigPayload = {
        chartType: currentChartType,
        title: currentTitle || '智能分析图表',
        xAxisField: currentXAxis, // 保存字段名称
        yAxisField: currentYAxis, // 保存字段名称
        dataPointField: currentPointField || '',
        hoverCardFields: currentTooltipFields || []
      };
      
      console.info('[Step3] 准备保存图表配置', {
        chartConfigPayload,
        notebookId,
        enabledChart
      });

      // 调用保存 API（后端会自动保存到 SQLite 并同步到 Turso）
      const saveRequest = {
        notebook_id: notebookId,
        chart_config: chartConfigPayload,
        analysis_components: enabledChart ? ['chart'] : []
      };
      
      console.info('[Step3] 发送保存请求', {
        ...saveRequest,
        hasChartConfig: !!saveRequest.chart_config,
        chartConfigType: typeof saveRequest.chart_config,
        chartConfigKeys: saveRequest.chart_config ? Object.keys(saveRequest.chart_config) : [],
        chartConfigValue: saveRequest.chart_config
      });
      
      // 验证 chart_config 是否存在
      if (!saveRequest.chart_config) {
        console.error('[Step3] ❌ 错误：chart_config 在发送前就是 undefined 或 null！', {
          chartConfigPayload,
          saveRequest
        });
        throw new Error('chart_config 不能为空');
      }
      
      const saveResponse = await apiClient.saveAIAnalysisConfig(saveRequest);
      
      console.info('[Step3] 保存配置响应', {
        success: saveResponse?.success,
        message: saveResponse?.message,
        data: saveResponse?.data
      });
      
      if (saveResponse?.success) {
        alert('图表配置已保存！');
        // 保存成功后，不要触发重新加载配置，因为当前配置已经是正确的
        // 只需要保持当前状态即可，避免从历史分析结果读取旧配置覆盖当前配置
        // 注意：不调用 setPrefillApplied(false)，避免触发回填逻辑
        console.info('[Step3] 配置已保存，保持当前配置状态', {
          xAxisField: currentXAxis,
          yAxisField: currentYAxis,
          dataPointField: currentPointField,
          hoverCardFields: currentTooltipFields
        });
      } else {
        throw new Error(saveResponse?.message || '保存失败');
      }
    } catch (error: any) {
      console.error('保存失败:', error);
      alert(`保存失败: ${error.message || '请重试'}`);
    }
  };
  
  // 保存AI配置
  const handleSaveAIConfig = async () => {
    if (!notebookId) {
      alert('请先选择笔记本');
      return;
    }
    try {
      const config = {
        notebook_id: notebookId,
        custom_prompt: customPrompt,
        analysis_components: enabledAI ? ['ai-custom'] : []
      };
      await apiClient.post('/api/ai-analysis-config', config);
      alert('AI配置已保存！');
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };
  
  const axisOptions = getAxisOptions();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef6fd] via-[#eef6fd] to-[#eef6fd] py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 配置选择区域 */}
        <div className="space-y-4">
          {/* 图表分析配置 */}
          <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 transition-colors ${enabledChart ? 'bg-[#eef6fd] border-[#90e2d0] ring-1 ring-[#d4f3ed]' : 'bg-white border-gray-200'}`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-[#0a917a] focus:ring-[#43ccb0] accent-[#06c3a8]"
                checked={enabledChart}
                onChange={(e) => {
                  setEnabledChart(e.target.checked);
                  if (e.target.checked && !selectedComponents.includes('chart')) {
                    onComponentToggle('chart');
                  } else if (!e.target.checked && selectedComponents.includes('chart')) {
                    onComponentToggle('chart');
                  }
                }}
              />
              <span className={`text-sm font-medium ${enabledChart ? 'text-[#0a6154]' : 'text-gray-700'}`} style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}>
                📈 图表分析配置
              </span>
            </label>
            <button
              type="button"
              onClick={() => setOpenChart(v => !v)}
              className="p-2 text-gray-500 hover:text-gray-700"
            >
              <svg className={`w-5 h-5 transition-transform ${openChart ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          
          {openChart && (
            <div className="bg-white rounded-2xl p-6 shadow-lg shadow-[#c4f1e5] border border-[#d4f3ed] space-y-6" style={{ boxShadow: '0 0 0 1px rgba(139, 92, 246, 0.1), 0 20px 25px -5px rgba(139, 92, 246, 0.1)' }}>
              {/* 步骤一：选择图表类型 */}
              <div>
                <div className="mb-4">
                  <div className="inline-flex items-center gap-2 rounded-lg bg-[#06c3a8] px-3 py-1 text-sm font-semibold text-white shadow-lg shadow-[#8de2d5]">
                    <span>📊</span>
                    <span>步骤一：选择分析图表</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {(['line', 'bar', 'pie', 'scatter', 'area'] as const).map((t) => {
                    const isSelected = currentChartType === t;
                    return (
                      <button
                        key={t}
                        onClick={() => handleChartTypeChange(t)}
                        className={`px-3 py-2 rounded-lg border text-xs transition-all ${
                          isSelected
                            ? 'border-[#6bd8c0] bg-white text-gray-800 shadow-sm shadow-[#c4f1e5]/60'
                            : 'border-[#b5ece0] bg-white text-gray-700 hover:border-[#6bd8c0]'
                        }`}
                        style={{ fontSize: '12px', lineHeight: '1.5', letterSpacing: '0.1px' }}
                      >
                        {chartTypeLabelMap[t] || t}
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* 步骤二：选择字段 */}
              <div>
                <div className="mb-4">
                  <div className="inline-flex items-center gap-2 rounded-lg bg-[#06c3a8] px-3 py-1 text-sm font-semibold text-white shadow-lg shadow-[#8de2d5]">
                    <span>📋</span>
                    <span>步骤二：选择图表字段</span>
                  </div>
                </div>
                
                {/* 现有字段 */}
                <div className="mb-4">
                  <div className="text-xs text-[#084338] inline-flex items-center px-2 py-1 rounded-full border border-[#6bd8c0] bg-[#F3E8FF] w-fit mb-2">
                    现有字段（来自笔记本配置）
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {existingFields.length === 0 ? (
                      <span className="text-xs text-gray-400" style={{ fontSize: '12px', lineHeight: '1.5', letterSpacing: '0.1px' }}>
                        暂无可用字段，请在笔记本配置中添加记录组件
                      </span>
                    ) : (
                      existingFields.map((f) => (
                        <span
                          key={f.name}
                          className="px-2 py-1 text-[10px] rounded-full border bg-white text-gray-700 border-[#6bd8c0]"
                        >
                          {f.name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                
                {/* AI自定义字段 */}
                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-[#084338] inline-flex items-center px-2 py-1 rounded-full border border-[#6bd8c0] bg-[#F3E8FF]">
                      AI 自定义字段
                    </span>
                  </div>
                  <div className="flex flex-col md:flex-row gap-3 items-start">
                    <input
                      type="text"
                      value={customFieldName}
                      onChange={(e) => setCustomFieldName(e.target.value)}
                      placeholder="告诉 AI 想要生成的字段，或直接输入字段名称"
                      className="flex-1 px-3 py-2 text-xs bg-white border border-[#90e2d0] rounded-lg focus:outline-none focus:border-[#6bd8c0]"
                      style={{ fontSize: '12px', lineHeight: '1.5', letterSpacing: '0.1px' }}
                    />
                    <div className="relative w-28 flex-shrink-0">
                      <button
                        ref={customFieldTypeButtonRef}
                        type="button"
                        onClick={() => {
                          setCustomFieldTypeDropdownOpen(v => {
                            const next = !v;
                            if (next) {
                              requestAnimationFrame(() => {
                                if (customFieldTypeButtonRef.current) {
                                  const rect = customFieldTypeButtonRef.current.getBoundingClientRect();
                                  setCustomFieldTypeMenuPos({
                                    top: rect.bottom + 8,
                                    left: rect.left,
                                    width: rect.width
                                  });
                                }
                              });
                            }
                            return next;
                          });
                        }}
                        className="w-full px-3 py-2 text-xs border border-[#90e2d0] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b5ece0] focus-visible:border-[#6bd8c0] flex items-center justify-between gap-2 transition-colors bg-[#eef6fd] text-[#084338]"
                      >
                        <span className="truncate">
                          {customFieldType === 'string' ? '文本' : customFieldType === 'number' ? '数字' : customFieldType === 'date' ? '日期' : '布尔值'}
                        </span>
                        <svg
                          className={`w-4 h-4 transition-transform flex-shrink-0 text-[#0a6154] ${customFieldTypeDropdownOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {customFieldTypeDropdownOpen && customFieldTypeMenuPos && createPortal(
                        <div
                          className="z-[180] bg-white border-2 border-[#b5ece0] rounded-2xl shadow-xl shadow-[#c4f1e5]"
                          style={{
                            position: 'fixed',
                            top: customFieldTypeMenuPos.top,
                            left: customFieldTypeMenuPos.left,
                            width: customFieldTypeMenuPos.width,
                            maxHeight: '300px',
                            overflowY: 'auto',
                            boxShadow: '0 10px 25px -5px rgba(139, 92, 246, 0.2), 0 0 0 1px rgba(139, 92, 246, 0.1)'
                          }}
                        >
                          <div className="p-2">
                            {customFieldTypeOptions.map((option) => {
                              const isSelected = customFieldType === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => {
                                    setCustomFieldType(option.value as any);
                                    setCustomFieldTypeDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                    isSelected
                                      ? 'bg-[#eef6fd] text-[#0a6154] font-medium'
                                      : 'text-gray-900 hover:bg-[#eef6fd]'
                                  }`}
                                  style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateField}
                      disabled={isGeneratingField}
                      className={`px-4 py-2 text-xs font-medium rounded-xl text-white transition-all ${
                        isGeneratingField
                          ? 'bg-[#06c3a8] opacity-75 cursor-not-allowed'
                          : 'bg-[#06c3a8] hover:bg-[#04b094]'
                      }`}
                      style={{ fontSize: '12px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                    >
                      {isGeneratingField ? 'AI 生成中…' : 'AI 生成'}
                    </button>
                  </div>
                  {customFields.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {customFields.map((field) => (
                        <span
                          key={field.name}
                          className="px-2 py-1 text-[10px] rounded-full border bg-white text-gray-700 border-[#6bd8c0] leading-normal"
                        >
                          {field.name}
                          <span
                            onClick={() => handleRemoveCustomField(field.name)}
                            className="text-[#0a917a] hover:text-[#0a6154] cursor-pointer ml-1"
                            title="删除此字段"
                          >
                            ×
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* 步骤三：坐标轴配置 */}
              <div>
                <div className="mb-4">
                  <div className="inline-flex items-center gap-2 rounded-lg bg-[#06c3a8] px-3 py-1 text-sm font-semibold text-white shadow-lg shadow-[#8de2d5]">
                    <span>⚙️</span>
                    <span>步骤三：坐标轴与显示</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* X 轴下拉框 */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-2" style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.2px' }}>
                      X 轴
                    </label>
                    <div className="relative flex-1" ref={xAxisDropdownRef}>
                      <button
                        ref={xAxisTriggerRef}
                        type="button"
                        onClick={() => setXAxisDropdownOpen(!xAxisDropdownOpen)}
                        className={`w-full px-4 py-2 text-left rounded-full flex items-center justify-between transition-all duration-200 ${
                          xAxisDropdownOpen
                            ? 'border-2 border-[#43ccb0] shadow-md shadow-[#c4f1e5] bg-gradient-to-r from-[#eef6fd] to-[#d4f3ed]'
                            : 'border border-[#90e2d0] bg-gradient-to-r from-[#eef6fd]/50 to-white hover:border-[#6bd8c0] hover:shadow-sm'
                        }`}
                        style={{ fontSize: '14px', lineHeight: '1.6', letterSpacing: '0.2px' }}
                      >
                        <span className={`transition-colors ${xAxisDropdownOpen ? 'text-[#0a6154] font-medium' : 'text-[#0a917a]'}`}>
                          {currentXAxis ? getFieldDisplayName(currentXAxis) : '选择字段...'}
                        </span>
                        <svg
                          className={`w-4 h-4 ml-2 transition-transform duration-200 flex-shrink-0 ${xAxisDropdownOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                          style={{ color: xAxisDropdownOpen ? '#9333ea' : '#a855f7' }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {xAxisDropdownOpen && xAxisMenuPos && createPortal(
                        <div
                          ref={xAxisMenuRef}
                          className="z-[180] bg-white border-2 border-[#b5ece0] rounded-2xl shadow-xl shadow-[#c4f1e5]"
                          style={{
                            position: 'fixed',
                            top: xAxisMenuPos.top,
                            left: xAxisMenuPos.left,
                            width: xAxisMenuPos.width,
                            maxHeight: '300px',
                            overflowY: 'auto',
                            boxShadow: '0 10px 25px -5px rgba(139, 92, 246, 0.2), 0 0 0 1px rgba(139, 92, 246, 0.1)'
                          }}
                        >
                          <div className="p-2">
                            {axisOptions.length === 0 ? (
                              <div className="px-4 py-3 text-gray-500 text-center" style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}>
                                暂无可用字段
                              </div>
                            ) : (
                              axisOptions.map((option) => {
                                const isSelected = currentXAxis === option.value;
                                const isHovered = hoveredXAxisOption === option.value;
                                const shouldHighlight = isHovered || (!hoveredXAxisOption && isSelected);
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                      setCurrentXAxis(option.value);
                                      setXAxisDropdownOpen(false);
                                      setHoveredXAxisOption(null);
                                    }}
                                    onMouseEnter={() => setHoveredXAxisOption(option.value)}
                                    onMouseLeave={() => setHoveredXAxisOption(null)}
                                    className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                      shouldHighlight
                                        ? 'bg-[#eef6fd] text-[#0a6154] font-medium'
                                        : 'text-gray-900 hover:bg-[#eef6fd]'
                                    }`}
                                    style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                  </div>

                  {/* Y 轴下拉框 */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-2" style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.2px' }}>
                      Y 轴
                    </label>
                    <div className="relative flex-1" ref={yAxisDropdownRef}>
                      <button
                        ref={yAxisTriggerRef}
                        type="button"
                        onClick={() => setYAxisDropdownOpen(!yAxisDropdownOpen)}
                        className={`w-full px-4 py-2 text-left rounded-full flex items-center justify-between transition-all duration-200 ${
                          yAxisDropdownOpen
                            ? 'border-2 border-[#43ccb0] shadow-md shadow-[#c4f1e5] bg-gradient-to-r from-[#eef6fd] to-[#d4f3ed]'
                            : 'border border-[#90e2d0] bg-gradient-to-r from-[#eef6fd]/50 to-white hover:border-[#6bd8c0] hover:shadow-sm'
                        }`}
                        style={{ fontSize: '14px', lineHeight: '1.6', letterSpacing: '0.2px' }}
                      >
                        <span className={`transition-colors ${yAxisDropdownOpen ? 'text-[#0a6154] font-medium' : 'text-[#0a917a]'}`}>
                          {currentYAxis ? getFieldDisplayName(currentYAxis) : '选择字段...'}
                        </span>
                        <svg
                          className={`w-4 h-4 ml-2 transition-transform duration-200 flex-shrink-0 ${yAxisDropdownOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                          style={{ color: yAxisDropdownOpen ? '#9333ea' : '#a855f7' }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {yAxisDropdownOpen && yAxisMenuPos && createPortal(
                        <div
                          ref={yAxisMenuRef}
                          className="z-[180] bg-white border-2 border-[#b5ece0] rounded-2xl shadow-xl shadow-[#c4f1e5]"
                          style={{
                            position: 'fixed',
                            top: yAxisMenuPos.top,
                            left: yAxisMenuPos.left,
                            width: yAxisMenuPos.width,
                            maxHeight: '300px',
                            overflowY: 'auto',
                            boxShadow: '0 10px 25px -5px rgba(139, 92, 246, 0.2), 0 0 0 1px rgba(139, 92, 246, 0.1)'
                          }}
                        >
                          <div className="p-2">
                            {axisOptions.length === 0 ? (
                              <div className="px-4 py-3 text-gray-500 text-center" style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}>
                                暂无可用字段
                              </div>
                            ) : (
                              axisOptions.map((option) => {
                                const isSelected = currentYAxis === option.value;
                                const isHovered = hoveredYAxisOption === option.value;
                                const shouldHighlight = isHovered || (!hoveredYAxisOption && isSelected);
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                      setCurrentYAxis(option.value);
                                      setYAxisDropdownOpen(false);
                                      setHoveredYAxisOption(null);
                                    }}
                                    onMouseEnter={() => setHoveredYAxisOption(option.value)}
                                    onMouseLeave={() => setHoveredYAxisOption(null)}
                                    className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                      shouldHighlight
                                        ? 'bg-[#eef6fd] text-[#0a6154] font-medium'
                                        : 'text-gray-900 hover:bg-[#eef6fd]'
                                    }`}
                                    style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                  </div>

                  {/* 数据点下拉框 */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-2" style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.2px' }}>
                      数据点
                    </label>
                    <div className="relative flex-1" ref={pointDropdownRef}>
                      <button
                        ref={pointTriggerRef}
                        type="button"
                        onClick={() => setPointDropdownOpen(!pointDropdownOpen)}
                        className={`w-full px-4 py-2 text-left rounded-full flex items-center justify-between transition-all duration-200 ${
                          pointDropdownOpen
                            ? 'border-2 border-[#43ccb0] shadow-md shadow-[#c4f1e5] bg-gradient-to-r from-[#eef6fd] to-[#d4f3ed]'
                            : 'border border-[#90e2d0] bg-gradient-to-r from-[#eef6fd]/50 to-white hover:border-[#6bd8c0] hover:shadow-sm'
                        }`}
                        style={{ fontSize: '14px', lineHeight: '1.6', letterSpacing: '0.2px' }}
                      >
                        <span className={`transition-colors ${pointDropdownOpen ? 'text-[#0a6154] font-medium' : 'text-[#0a917a]'}`}>
                          {currentPointField ? getFieldDisplayName(currentPointField) : '选择字段...'}
                        </span>
                        <svg
                          className={`w-4 h-4 ml-2 transition-transform duration-200 flex-shrink-0 ${pointDropdownOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                          style={{ color: pointDropdownOpen ? '#9333ea' : '#a855f7' }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {pointDropdownOpen && pointMenuPos && createPortal(
                        <div
                          ref={pointMenuRef}
                          className="z-[180] bg-white border-2 border-[#b5ece0] rounded-2xl shadow-xl shadow-[#c4f1e5]"
                          style={{
                            position: 'fixed',
                            top: pointMenuPos.top,
                            left: pointMenuPos.left,
                            width: pointMenuPos.width,
                            maxHeight: '300px',
                            overflowY: 'auto',
                            boxShadow: '0 10px 25px -5px rgba(139, 92, 246, 0.2), 0 0 0 1px rgba(139, 92, 246, 0.1)'
                          }}
                        >
                          <div className="p-2">
                            {axisOptions.length === 0 ? (
                              <div className="px-4 py-3 text-gray-500 text-center" style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}>
                                暂无可用字段
                              </div>
                            ) : (
                              axisOptions.map((option) => {
                                const isSelected = currentPointField === option.value;
                                const isHovered = hoveredPointOption === option.value;
                                const shouldHighlight = isHovered || (!hoveredPointOption && isSelected);
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                      setCurrentPointField(option.value);
                                      setPointDropdownOpen(false);
                                      setHoveredPointOption(null);
                                    }}
                                    onMouseEnter={() => setHoveredPointOption(option.value)}
                                    onMouseLeave={() => setHoveredPointOption(null)}
                                    className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                      shouldHighlight
                                        ? 'bg-[#eef6fd] text-[#0a6154] font-medium'
                                        : 'text-gray-900 hover:bg-[#eef6fd]'
                                    }`}
                                    style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                  </div>

                  {/* 悬浮提示下拉框（支持多选） */}
                  <div>
                    <label className="block font-medium text-gray-700 mb-2" style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.2px' }}>
                      悬浮提示（支持多选）
                    </label>
                    <div className="relative flex-1" ref={tooltipDropdownRef}>
                      <button
                        ref={tooltipTriggerRef}
                        type="button"
                        onClick={() => setTooltipDropdownOpen(!tooltipDropdownOpen)}
                        className={`w-full min-h-[44px] px-4 py-2 text-left rounded-full flex flex-wrap items-center gap-2 relative transition-all duration-200 ${
                          tooltipDropdownOpen
                            ? 'border-2 border-[#43ccb0] shadow-md shadow-[#c4f1e5] bg-gradient-to-r from-[#eef6fd] to-[#d4f3ed]'
                            : 'border border-[#90e2d0] bg-gradient-to-r from-[#eef6fd]/50 to-white hover:border-[#6bd8c0] hover:shadow-sm'
                        }`}
                        style={{ fontSize: '14px', lineHeight: '1.6', letterSpacing: '0.2px' }}
                      >
                        {currentTooltipFields.length === 0 && (
                          <span className={`transition-colors ${tooltipDropdownOpen ? 'text-[#0a6154] font-medium' : 'text-[#0a917a]'}`}>
                            选择字段...
                          </span>
                        )}
                        {currentTooltipFields.map((name) => (
                          <span
                            key={`tag-${name}`}
                            className="inline-flex items-center gap-0 h-6 text-[12px] font-medium rounded-full pl-2 pr-[1px] border border-[#90e2d0] bg-[#eef6fd] text-[#084338]"
                          >
                            <span className="leading-normal whitespace-nowrap">{getFieldDisplayName(name)}</span>
                            <span
                              role="button"
                              tabIndex={0}
                              className="w-3.5 h-3.5 inline-flex items-center justify-center rounded-full text-[#0a917a] hover:text-[#0a6154] hover:bg-white/80 flex-shrink-0 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentTooltipFields(prev => prev.filter(n => n !== name));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setCurrentTooltipFields(prev => prev.filter(n => n !== name));
                                }
                              }}
                            >
                              ×
                            </span>
                          </span>
                        ))}
                        <svg
                          className={`w-4 h-4 ml-auto transition-transform duration-200 flex-shrink-0 ${tooltipDropdownOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                          style={{ color: tooltipDropdownOpen ? '#9333ea' : '#a855f7' }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {tooltipDropdownOpen && tooltipMenuPos && createPortal(
                        <div
                          ref={tooltipMenuRef}
                          className="z-[180] bg-white border-2 border-[#b5ece0] rounded-2xl shadow-xl shadow-[#c4f1e5]"
                          style={{
                            position: 'fixed',
                            top: tooltipMenuPos.top,
                            left: tooltipMenuPos.left,
                            width: tooltipMenuPos.width,
                            maxHeight: '300px',
                            overflowY: 'auto',
                            boxShadow: '0 10px 25px -5px rgba(139, 92, 246, 0.2), 0 0 0 1px rgba(139, 92, 246, 0.1)'
                          }}
                        >
                          <div className="p-2">
                            {axisOptions.length === 0 ? (
                              <div className="px-4 py-3 text-gray-500 text-center" style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}>
                                暂无可用字段
                              </div>
                            ) : (
                              axisOptions.map((option) => {
                                const isSelected = currentTooltipFields.includes(option.value);
                                const isHovered = hoveredTooltipOption === option.value;
                                const shouldHighlight = isHovered || (!hoveredTooltipOption && isSelected);
                                return (
                                  <button
                                    key={`tooltip-${option.value}`}
                                    type="button"
                                    onClick={() => {
                                      setCurrentTooltipFields(prev => {
                                        if (isSelected) {
                                          return prev.filter(v => v !== option.value);
                                        }
                                        return [...prev, option.value];
                                      });
                                    }}
                                    onMouseEnter={() => setHoveredTooltipOption(option.value)}
                                    onMouseLeave={() => setHoveredTooltipOption(null)}
                                    className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                      shouldHighlight
                                        ? 'bg-[#eef6fd] text-[#0a6154] font-medium'
                                        : 'text-gray-900 hover:bg-[#eef6fd]'
                                    }`}
                                    style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-block w-4 h-4 rounded border ${isSelected ? 'bg-[#eef6fd]0/80 border-[#43ccb0]' : 'border-gray-300'}`}></span>
                                      <span>{option.label}</span>
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 保存按钮 */}
              <div className="flex justify-end">
                <button
                  onClick={handleSaveChartConfig}
                  disabled={!enabledChart}
                  className="px-3 py-2 text-xs bg-[#06c3a8] text-white rounded-lg hover:bg-[#04b094] shadow-md shadow-gray-500/40 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  style={{ fontSize: '12px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                >
                  💾 保存图表配置
                </button>
              </div>
            </div>
          )}
          
          {/* AI自定义分析配置 */}
          <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 transition-colors ${enabledAI ? 'bg-[#eef6fd] border-[#90e2d0] ring-1 ring-[#d4f3ed]' : 'bg-white border-gray-200'}`}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-[#0a917a] focus:ring-[#43ccb0] accent-[#06c3a8]"
                checked={enabledAI}
                onChange={(e) => {
                  setEnabledAI(e.target.checked);
                  if (e.target.checked && !selectedComponents.includes('insight')) {
                    onComponentToggle('insight');
                  } else if (!e.target.checked && selectedComponents.includes('insight')) {
                    onComponentToggle('insight');
                  }
                }}
              />
              <span className={`text-sm font-medium ${enabledAI ? 'text-[#0a6154]' : 'text-gray-700'}`} style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}>
                🤖 AI自定义分析
              </span>
            </label>
            <button
              type="button"
              onClick={() => setOpenAI(v => !v)}
              className="p-2 text-gray-500 hover:text-gray-700"
            >
              <svg className={`w-5 h-5 transition-transform ${openAI ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          
          {openAI && (
            <div className="bg-white rounded-2xl p-6 shadow-lg shadow-[#c4f1e5] border border-[#d4f3ed] space-y-4" style={{ boxShadow: '0 0 0 1px rgba(139, 92, 246, 0.1), 0 20px 25px -5px rgba(139, 92, 246, 0.1)' }}>
              {/* 标题区域 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 relative">
                  {isEditingTitle ? (
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => {
                        if (editingTitle.trim()) {
                          const newTitle = editingTitle.trim();
                          setPromptTitle(newTitle);
                          // 如果当前模板存在，更新模板标题
                          if (currentTemplateId && currentTemplateId.startsWith('template_')) {
                            setPromptTemplates(prev => 
                              prev.map(t => t.id === currentTemplateId ? { ...t, title: newTitle } : t)
                            );
                          }
                        }
                        setIsEditingTitle(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (editingTitle.trim()) {
                            const newTitle = editingTitle.trim();
                            setPromptTitle(newTitle);
                            // 如果当前模板存在，更新模板标题
                            if (currentTemplateId && currentTemplateId.startsWith('template_')) {
                              setPromptTemplates(prev => 
                                prev.map(t => t.id === currentTemplateId ? { ...t, title: newTitle } : t)
                              );
                            }
                          }
                          setIsEditingTitle(false);
                        } else if (e.key === 'Escape') {
                          setEditingTitle(promptTitle);
                          setIsEditingTitle(false);
                        }
                      }}
                      className="text-lg font-semibold text-gray-900 border border-[#90e2d0] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#43ccb0]"
                      style={{ fontSize: '18px', lineHeight: '1.5', letterSpacing: '0.2px', minWidth: '120px' }}
                      autoFocus
                    />
                  ) : (
                    <>
                      <span 
                        className="text-lg font-semibold text-gray-900 cursor-pointer hover:text-[#0a6154] transition-colors"
                        onClick={() => {
                          if (isEditingPrompt) {
                            setEditingTitle(promptTitle);
                            setIsEditingTitle(true);
                          }
                        }}
                      >
                        {promptTitle}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPromptTitleDropdownOpen(!promptTitleDropdownOpen)}
                        className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                      >
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
                        <div 
                          data-prompt-title-dropdown
                          className="absolute top-full left-0 mt-2 bg-white border-2 border-[#b5ece0] rounded-2xl shadow-xl shadow-[#c4f1e5] z-50 min-w-[200px]" 
                          style={{ boxShadow: '0 10px 25px -5px rgba(139, 92, 246, 0.2), 0 0 0 1px rgba(139, 92, 246, 0.1)' }}
                        >
                          <div className="p-2 max-h-[300px] overflow-y-auto">
                            {promptTemplates.map((template) => (
                              <button
                                key={template.id}
                                type="button"
                                onClick={() => {
                                  setCurrentTemplateId(template.id);
                                  setPromptTitle(template.title);
                                  setCustomPrompt(template.content);
                                  setPromptTitleDropdownOpen(false);
                                  setIsEditingPrompt(false);
                                }}
                                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                                  currentTemplateId === template.id
                                    ? 'bg-[#eef6fd] text-[#0a6154] font-medium'
                                    : 'text-gray-900 hover:bg-[#eef6fd]'
                                }`}
                                style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
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
                    const newId = `template_${Date.now()}`;
                    setPromptTitle('新建模版');
                    setEditingTitle('新建模版');
                    setPromptTemplate(customPrompt);
                    setCustomPrompt('');
                    setCurrentTemplateId(newId);
                    setIsEditingPrompt(true);
                    setIsEditingTitle(true);
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-[#0a6154] bg-[#eef6fd] rounded-lg hover:bg-[#d4f3ed] transition-colors"
                  style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                >
                  新建 Prompt
                </button>
              </div>

              {/* 提示词内容区域 */}
              <div>
                <label className="block font-medium text-gray-700 mb-2" style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.2px' }}>
                  提示词内容 (手动选择)
                </label>
                {isEditingPrompt ? (
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="你是一名面向个人知识管理与习惯跟踪的中文数据分析助手。请基于用户在 至 期间的笔记数据,完成一份简洁、可执行的分析报告。"
                    rows={12}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#43ccb0] focus:border-transparent resize-none"
                    style={{ fontSize: '13px', lineHeight: '1.8', letterSpacing: '0.1px' }}
                  />
                ) : (
                  <div className="w-full min-h-[200px] px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 whitespace-pre-wrap" style={{ fontSize: '13px', lineHeight: '1.8', letterSpacing: '0.1px' }}>
                    {customPrompt || '暂无提示词内容，请点击编辑按钮添加。'}
                  </div>
                )}
              </div>

              {/* 操作按钮区域 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isEditingPrompt ? (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          // 如果是新建模板，保存到模板列表
                          if (currentTemplateId.startsWith('template_')) {
                            const newTemplate = {
                              id: currentTemplateId,
                              title: promptTitle,
                              content: customPrompt
                            };
                            setPromptTemplates(prev => {
                              const exists = prev.find(t => t.id === currentTemplateId);
                              if (exists) {
                                return prev.map(t => t.id === currentTemplateId ? newTemplate : t);
                              }
                              return [...prev, newTemplate];
                            });
                          }
                          // 编辑模式下保存时，只保存模板，不保存配置（避免重复保存）
                          // 用户可以通过外部的"保存 AI 配置"按钮来保存配置
                          setIsEditingPrompt(false);
                          setIsEditingTitle(false);
                        }}
                        disabled={!enabledAI || !promptTitle.trim() || !customPrompt.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-[#06c3a8] rounded-lg hover:bg-[#04b094] disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // 恢复之前的内容和标题
                          const currentTemplate = promptTemplates.find(t => t.id === currentTemplateId);
                          if (currentTemplate) {
                            setPromptTitle(currentTemplate.title);
                            setCustomPrompt(currentTemplate.content);
                          } else {
                            setCustomPrompt(promptTemplate);
                          }
                          setIsEditingPrompt(false);
                          setIsEditingTitle(false);
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPromptTemplate(customPrompt);
                        setIsEditingPrompt(true);
                      }}
                      className="px-4 py-2 text-sm font-medium text-[#0a6154] bg-white border border-[#90e2d0] rounded-lg hover:bg-[#eef6fd] transition-colors"
                      style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                    >
                      编辑
                    </button>
                  )}
                </div>
                <button
                  onClick={handleSaveAIConfig}
                  disabled={!enabledAI}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#06c3a8] rounded-lg hover:bg-[#04b094] shadow-md shadow-gray-500/40 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  style={{ fontSize: '13px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                >
                  保存 AI 配置
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* 操作按钮 */}
        <div className="flex justify-end gap-4">
          <button
            onClick={onBack}
            disabled={isSubmitting}
            className="px-6 py-3 rounded-full font-medium text-[#0a6154] bg-white border-2 border-gray-200 hover:border-[#90e2d0] hover:bg-[#eef6fd] transition-colors"
            style={{ fontSize: '12px', lineHeight: '1.5', letterSpacing: '0.2px' }}
          >
            返回
          </button>
          <button
            onClick={async () => {
              console.log('🚀 [AnalysisPage] 点击开始分析按钮', {
                enabledChart,
                enabledAI,
                selectedNoteIds: selectedNoteIds.length,
                selectedNoteIdsArray: selectedNoteIds,
                isSubmitting,
                selectedComponents,
                notebookId: notebookId
              });
              
              // 检查按钮是否被禁用
              if ((!enabledChart && !enabledAI) || selectedNoteIds.length === 0 || isSubmitting) {
                console.warn('⚠️ [AnalysisPage] 按钮被禁用，无法开始分析', {
                  enabledChart,
                  enabledAI,
                  selectedNoteIdsCount: selectedNoteIds.length,
                  isSubmitting
                });
                return;
              }
              
              try {
                await onSubmit();
              } catch (error) {
                console.error('❌ [AnalysisPage] 开始分析失败:', error);
              }
            }}
            disabled={(!enabledChart && !enabledAI) || selectedNoteIds.length === 0 || isSubmitting}
            className={`px-6 py-3 rounded-full font-medium transition-colors ${
              (enabledChart || enabledAI) && selectedNoteIds.length > 0 && !isSubmitting
                ? 'bg-[#06c3a8] text-white hover:bg-[#04b094] shadow-lg shadow-[#8de2d5]'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            style={{ fontSize: '12px', lineHeight: '1.5', letterSpacing: '0.2px' }}
            title={`enabledChart: ${enabledChart}, enabledAI: ${enabledAI}, selectedNoteIds: ${selectedNoteIds.length} [${selectedNoteIds.join(', ')}], isSubmitting: ${isSubmitting}`}
          >
            {isSubmitting ? '分析中...' : `🚀 开始分析（${selectedNoteIds.length} 条笔记，${(enabledChart ? 1 : 0) + (enabledAI ? 1 : 0)} 个配置）`}
          </button>
        </div>
        {(!enabledChart && !enabledAI) && (
          <div className="text-xs text-amber-600 text-center" style={{ fontSize: '12px', lineHeight: '1.5', letterSpacing: '0.1px' }}>
            请先勾选至少一个分析配置（图表/AI）
          </div>
        )}
        {selectedNoteIds.length === 0 && (enabledChart || enabledAI) && (
          <div className="text-xs text-amber-600 text-center mt-2" style={{ fontSize: '12px', lineHeight: '1.5', letterSpacing: '0.1px' }}>
            请先选择至少一条笔记（当前已选择：{selectedNoteIds.length} 条）
          </div>
        )}
      </div>
    </div>
  );
};

// 主组件
const AnalysisPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { notebookId: urlNotebookId } = useParams<{ notebookId?: string }>();
  
  // 根据 URL 确定初始步骤（支持新格式 /analysis/:notebookId?step=select|setting|result）
  const getInitialStep = (): 1 | 2 | 3 => {
    const path = location.pathname;
    const stepParam = new URLSearchParams(location.search).get('step');
    if (path.startsWith('/analysis/setting/')) return 3;
    if (path.startsWith('/analysis/select/')) return 2;
    if (stepParam === 'setting' || stepParam === 'config' || path.includes('/setting/')) return 3;
    if (stepParam === 'select') return 2;
    if (path.startsWith('/AnalysisPage/Setting/')) return 3;
    if (path.startsWith('/AnalysisPage/Select')) return 2;
    return 2; // 默认第二步
  };
  
  const [step, setStep] = useState<1 | 2 | 3>(getInitialStep());
  const [notebooks, setNotebooks] = useState<ApiNotebook[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(urlNotebookId || null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [mode, setMode] = useState<'ai' | 'custom'>('ai');
  const [selectedComponents, setSelectedComponents] = useState<AnalysisComponent[]>(['chart', 'insight']);
  const [aiPrompt, setAiPrompt] = useState<string>(DEFAULT_AI_PROMPT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastNotebookId, setLastNotebookId] = useState<string | null>(null);
  const [prefillLoadedForNotebook, setPrefillLoadedForNotebook] = useState<string | null>(null);
  const [chartConfigState, setChartConfigState] = useState<ChartConfigState>({
    chartType: 'line',
    title: '',
    xAxisField: '',
    yAxisField: '',
    dataPointField: '',
    hoverCardFields: [],
    customFields: []
  });
  const [prefillChartConfig, setPrefillChartConfig] = useState<Partial<ChartConfigState> | null>(null);
  // 进入配置页时默认选中并保留 chart/insight
  useEffect(() => {
    if (step === 3) {
      setSelectedComponents((prev) => {
        const set = new Set(prev);
        // 确保图表和AI分析默认被选中
        set.add('chart');
        set.add('insight');
        return Array.from(set) as AnalysisComponent[];
      });
    }
  }, [step]);

  // 检查当前路径，如果不是 AnalysisPage 相关路径，不加载数据
  const isAnalysisPageRoute = location.pathname.startsWith('/AnalysisPage/') || 
                               location.pathname.startsWith('/analysis/') ||
                               location.pathname === '/analysis';
  
  // 加载笔记本列表
  useEffect(() => {
    // 如果不在 AnalysisPage 路由，不加载数据
    if (!isAnalysisPageRoute) {
      console.log('ℹ️ [AnalysisPage] 不在 AnalysisPage 路由，跳过加载:', location.pathname);
      return;
    }
    
    const loadNotebooks = async () => {
      try {
        console.log('📚 [AnalysisPage] 开始加载笔记本列表...');
        const notebookList = await getNotebooks();
        console.log('📚 [AnalysisPage] 加载到笔记本:', notebookList.length, '个', notebookList);
        setNotebooks(notebookList);
        
        // 如果URL中有notebookId，设置为选中
        if (urlNotebookId && notebookList.some(nb => nb.notebook_id === urlNotebookId)) {
          setSelectedNotebookId(urlNotebookId);
        } else if (notebookList.length > 0 && !selectedNotebookId) {
          // 如果没有指定notebookId但有笔记本，默认选择第一个
          setSelectedNotebookId(notebookList[0].notebook_id);
        }
      } catch (error) {
        console.error('❌ [AnalysisPage] 加载笔记本失败:', error);
        // 设置空数组，避免显示错误状态
        setNotebooks([]);
      }
    };
    
    // 如果不在 AnalysisPage 路由，不加载数据
    if (!isAnalysisPageRoute) {
      console.log('ℹ️ [AnalysisPage] 不在 AnalysisPage 路由，跳过加载:', location.pathname);
      return;
    }
    
    loadNotebooks();
  }, [urlNotebookId, isAnalysisPageRoute, location.pathname]); // 添加路由检查

  // 每次切换笔记本时重置 AI 提示词和选中的笔记ID
  useEffect(() => {
    // 只有在真正切换笔记本时才清空选中的笔记（避免在同一笔记本内切换步骤时清空）
    if (selectedNotebookId && lastNotebookId && selectedNotebookId !== lastNotebookId) {
      console.log('🔄 [AnalysisPage] 切换笔记本，清空选中的笔记ID', {
        from: lastNotebookId,
        to: selectedNotebookId
      });
      setSelectedNoteIds([]);
    }
    setAiPrompt(DEFAULT_AI_PROMPT);
    setLastNotebookId(selectedNotebookId);
  }, [selectedNotebookId, lastNotebookId]);

  // 若通过路由 state 带入了选中的笔记与日期范围，则在首次进入时同步到本地状态
  useEffect(() => {
    const state: any = (location as any).state || {};
    if (state.selectedNoteIds && Array.isArray(state.selectedNoteIds) && selectedNoteIds.length === 0) {
      setSelectedNoteIds(state.selectedNoteIds);
    }
    if (state.dateRange && !dateRange.from && !dateRange.to) {
      setDateRange(state.dateRange);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 从 URL 中提取 notebookId 并同步到状态（不再从 URL 恢复 noteIds）
  useEffect(() => {
    // 如果不在 AnalysisPage 路由，不执行任何操作
    if (!isAnalysisPageRoute) {
      return;
    }
    
    const path = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    let extractedNotebookId: string | null = null;
    let expectedStep: 1 | 2 | 3 = step;
    
    // 新格式：/analysis/select/:notebookId 或 /analysis/setting/:notebookId
    const selectMatchNew = path.match(/^\/analysis\/select\/([^/]+)/);
    const settingMatchNew = path.match(/^\/analysis\/setting\/([^/]+)/);
    const analysisMatch = path.match(/^\/analysis\/([^/]+)/);
    
    if (settingMatchNew) {
      extractedNotebookId = settingMatchNew[1];
      expectedStep = 3;
    } else if (selectMatchNew) {
      extractedNotebookId = selectMatchNew[1];
      expectedStep = 2;
    } else if (analysisMatch) {
      extractedNotebookId = analysisMatch[1];
      const stepParam = searchParams.get('step');
      if (stepParam === 'setting' || stepParam === 'config' || stepParam === 'result') {
        expectedStep = 3;
      } else if (stepParam === 'select') {
        expectedStep = 2;
      }
    } else if (path.startsWith('/AnalysisPage/Setting/')) {
      const parts = path.replace('/AnalysisPage/Setting/', '').split('/').filter(Boolean);
      extractedNotebookId = parts[0] || null;
      expectedStep = 3;
    } else if (path.startsWith('/AnalysisPage/Select')) {
      const selectMatch = path.match(/\/AnalysisPage\/Select\/([^/]+)/);
      extractedNotebookId = selectMatch ? selectMatch[1] : null;
      expectedStep = 2;
    }
    
    // 如果从URL中提取到了notebookId，且与当前选中的不同，则更新
    if (extractedNotebookId && extractedNotebookId !== selectedNotebookId) {
      setSelectedNotebookId(extractedNotebookId);
    }
    
    // 同步 step
    if (expectedStep !== step) {
      setStep(expectedStep);
    }
  }, [location.pathname, location.search]);

  // 根据步骤和选中的笔记本更新 URL（不再携带 noteIds）
  useEffect(() => {
    // 如果不在 AnalysisPage 路由，不更新 URL（避免干扰其他页面）
    if (!isAnalysisPageRoute) {
      console.log('ℹ️ [AnalysisPage] 不在 AnalysisPage 路由，跳过 URL 更新:', location.pathname);
      return;
    }
    
    if (!selectedNotebookId) return;
    
    const currentPath = window.location.pathname;
    const currentSearch = window.location.search;
    
    // 如果当前路径是分析详情页面，不更新 URL
    if (currentPath.startsWith('/analysis/') && !currentPath.startsWith('/AnalysisPage/')) {
      console.log('ℹ️ [AnalysisPage] 当前在分析详情页面，跳过 URL 更新');
      return;
    }
    
    const basePath = step === 2
      ? `/analysis/select/${selectedNotebookId || ''}`.replace(/\/$/, '')
      : `/analysis/setting/${selectedNotebookId || ''}`.replace(/\/$/, '');
    const expectedFullPath = basePath;
    const currentFullPath = currentPath + currentSearch;
    if (currentFullPath !== expectedFullPath) {
      navigate(expectedFullPath, { replace: true });
    }
  }, [step, selectedNotebookId, selectedNoteIds, navigate, isAnalysisPageRoute, location.pathname]);

  // 进入笔记选择或配置阶段时，尝试回填最近一次分析配置
  useEffect(() => {
    const loadLatestAnalysis = async () => {
      if (!selectedNotebookId) return;
      
      // 只在配置页面（step === 3）时加载配置
      if (step !== 3) {
        console.info('[AnalysisPage] 不在配置页面，跳过加载配置', { selectedNotebookId, step });
        return;
      }
      
      // 每次进入配置页面时都重新加载配置，确保获取最新设置
      // 使用一个简单的计数器来避免无限循环，但允许重新加载
      try {
        // 优先从 ai_analysis_setting 表读取配置
        try {
          console.info('[AnalysisPage] 开始从 ai_analysis_setting 读取配置', { notebookId: selectedNotebookId });
          const configResp = await apiClient.getAIAnalysisConfig(selectedNotebookId);
          console.info('[AnalysisPage] ai_analysis_setting 响应', {
            success: configResp?.success,
            hasData: !!configResp?.data,
            hasConfig: !!configResp?.data?.config,
            configKeys: configResp?.data?.config ? Object.keys(configResp.data.config) : [],
            fullResponse: configResp
          });
          
          if (configResp?.success && configResp?.data?.config) {
            const config = configResp.data.config;
            console.info('[AnalysisPage] 从 ai_analysis_setting 获取配置', config);

            // 回填分析组件（确保至少包含 chart 和 insight）
            if (Array.isArray(config.analysis_components) && config.analysis_components.length > 0) {
              const mapped = (config.analysis_components as string[]).map((c) =>
                c === 'ai-custom' ? 'insight' : c
              ) as AnalysisComponent[];
              // 确保至少包含 chart 和 insight
              const set = new Set(mapped);
              set.add('chart');
              set.add('insight');
              setSelectedComponents(Array.from(set) as AnalysisComponent[]);
            } else {
              // 如果没有配置，确保默认选中 chart 和 insight
              setSelectedComponents(['chart', 'insight']);
            }

            if (config.custom_prompt) {
              setAiPrompt(config.custom_prompt);
            }

            // 回填图表配置（从 chart_config）
            console.info('[AnalysisPage] 检查 chart_config', {
              hasChartConfig: !!config.chart_config,
              chartConfig: config.chart_config,
              configKeys: Object.keys(config)
            });
            
            if (config.chart_config) {
              const chartConfig = config.chart_config;
              console.info('[AnalysisPage] 找到 chart_config，准备回填', {
                chartConfig,
                xAxisField: chartConfig.xAxisField,
                yAxisField: chartConfig.yAxisField,
                dataPointField: chartConfig.dataPointField,
                hoverCardFields: chartConfig.hoverCardFields
              });
              
              // 回填自定义字段（从 config.custom_fields）
              const savedCustomFields = Array.isArray(config.custom_fields) 
                ? config.custom_fields.map((f: any) => ({
                    name: f.name || f,
                    type: f.type || 'string',
                    origin: f.origin
                  }))
                : [];

              // 直接使用保存的配置（保存时保存的就是字段名称）
              const mappedPrefill: Partial<ChartConfigState> = {
                chartType: chartConfig.chartType || 'line',
                title: chartConfig.title || '',
                xAxisField: chartConfig.xAxisField || '', // 直接使用保存的字段名称
                yAxisField: chartConfig.yAxisField || '', // 直接使用保存的字段名称
                dataPointField: chartConfig.dataPointField || '',
                hoverCardFields: Array.isArray(chartConfig.hoverCardFields)
                  ? chartConfig.hoverCardFields.filter(Boolean)
                  : [],
                customFields: savedCustomFields
              };
              
              console.info('[AnalysisPage] 构建的回填配置', mappedPrefill);

              console.info('[AnalysisPage] 从 ai_analysis_setting 应用图表配置', {
                mappedPrefill,
                customFieldsCount: savedCustomFields.length,
                originalChartConfig: {
                  xAxisField: chartConfig.xAxisField,
                  yAxisField: chartConfig.yAxisField,
                  dataPointField: chartConfig.dataPointField,
                  hoverCardFields: chartConfig.hoverCardFields,
                  fieldMappings: Array.isArray(chartConfig.fieldMappings)
                    ? chartConfig.fieldMappings.length
                    : typeof chartConfig.fieldMappings === 'object'
                      ? Object.keys(chartConfig.fieldMappings || {}).length
                      : 0
                },
                configFields: {
                  existing_fields: config.existing_fields?.length || 0,
                  custom_fields: config.custom_fields?.length || 0,
                  all_fields: config.all_fields?.length || 0
                }
              });

              // 检查配置是否有效（有字段名称且不是空字符串）
              const hasValidConfig = mappedPrefill && 
                (mappedPrefill.xAxisField || mappedPrefill.yAxisField) &&
                mappedPrefill.xAxisField !== '' && 
                mappedPrefill.yAxisField !== '';
              
              if (hasValidConfig) {
                // 只有当配置中有有效的字段时才设置，避免空配置覆盖当前配置
                console.info('[AnalysisPage] ✅ 从 ai_analysis_setting 应用图表配置', {
                  hasXAxis: !!mappedPrefill.xAxisField,
                  hasYAxis: !!mappedPrefill.yAxisField,
                  xAxisField: mappedPrefill.xAxisField,
                  yAxisField: mappedPrefill.yAxisField,
                  fullConfig: mappedPrefill
                });
                setPrefillChartConfig(mappedPrefill);
                setPrefillLoadedForNotebook(selectedNotebookId);
                return; // 如果从 ai_analysis_setting 成功获取配置，就不再从 analysis_results 读取
              } else {
                console.warn('[AnalysisPage] ⚠️ ai_analysis_setting 中的配置无效，跳过', {
                  mappedPrefill,
                  hasXAxis: !!mappedPrefill?.xAxisField,
                  hasYAxis: !!mappedPrefill?.yAxisField,
                  xAxisField: mappedPrefill?.xAxisField,
                  yAxisField: mappedPrefill?.yAxisField,
                  reason: !mappedPrefill ? 'mappedPrefill is null/undefined' :
                    !mappedPrefill.xAxisField && !mappedPrefill.yAxisField ? 'no axis fields' :
                    mappedPrefill.xAxisField === '' || mappedPrefill.yAxisField === '' ? 'empty axis fields' : 'unknown'
                });
              }
            } else {
              console.warn('[AnalysisPage] ai_analysis_setting 中没有 chart_config', {
                configKeys: Object.keys(config),
                hasChartConfig: !!config.chart_config
              });
            }
          } else {
            console.warn('[AnalysisPage] ai_analysis_setting 中没有 config 数据', {
              hasData: !!configResp?.data,
              hasConfig: !!configResp?.data?.config
            });
          }
        } catch (configError) {
          console.warn('[AnalysisPage] 从 ai_analysis_setting 读取配置失败，尝试从 analysis_results 读取:', {
            error: configError,
            errorMessage: configError instanceof Error ? configError.message : String(configError),
            errorStack: configError instanceof Error ? configError.stack : undefined
          });
        }

        // 回退：从 analysis_results 读取
        const resp = await apiClient.getAnalyses();
        const list = resp?.data || [];
        console.info('[AnalysisPage] 获取历史分析列表', { total: list.length, notebookId: selectedNotebookId });
        // 后端按 created_at DESC 返回，找到第一个 notebookId 匹配的
        const latest = list.find((item: any) => item.notebookId === selectedNotebookId);
        if (!latest) {
          console.info('[AnalysisPage] 未找到匹配 notebook 的历史分析', { notebookId: selectedNotebookId });
          setPrefillLoadedForNotebook(selectedNotebookId);
          return;
        }

        // 回填分析组件、模式和日期范围
        const components =
          latest.selectedAnalysisComponents ||
          latest.analysisData?.selectedAnalysisComponents ||
          [];
        const mappedComponents = Array.isArray(components)
          ? (components as string[]).map((c) => (c === 'ai-custom' ? 'insight' : c))
          : [];
        if (mappedComponents.length > 0) {
          // 确保至少包含 chart 和 insight
          const set = new Set(mappedComponents);
          set.add('chart');
          set.add('insight');
          setSelectedComponents(Array.from(set) as AnalysisComponent[]);
        } else {
          // 如果没有配置，确保默认选中 chart 和 insight
          setSelectedComponents(['chart', 'insight']);
        }

        if (latest.mode === 'custom' || latest.mode === 'ai') {
          setMode(latest.mode);
        }

        const range =
          latest.analysisData?.selectedNotes?.dateRange ||
          latest.metadata?.dataSource?.dateRange;
        if (range?.from || range?.to) {
          setDateRange({
            from: range.from || '',
            to: range.to || ''
          });
        }

        // 回填图表配置（简化版：从历史分析结果中提取配置）
        const chartConfig = latest.componentConfigs?.chart || latest.analysisData?.componentConfigs?.chart;
        if (chartConfig) {
          // 尝试从 chartConfigs 中提取配置
          const cfg = Array.isArray(chartConfig?.chartConfigs)
            ? chartConfig.chartConfigs[0]?.config || chartConfig.chartConfigs[0]
            : chartConfig.chartConfigs?.config || chartConfig.chartConfigs || chartConfig.config || chartConfig;
          
          console.info('[AnalysisPage] 解析历史图表配置', {
            cfg,
            axisDisplay: cfg?.axisDisplay,
            fieldAliasMap: cfg?.fieldAliasMap,
            fieldMappings: chartConfig.fieldMappings
          });
          
          // 只从 fieldMappings 中提取字段名称（这是唯一可靠的数据源）
          // 注意：axisDisplay 只是用于显示的标题，可能包含默认值（如"日期"、"数值"），不是实际的字段名称
          // 因此不应该从 axisDisplay 读取字段名称
          let xAxisName = '';
          let yAxisName = '';
          let pointFieldName = '';
          const hoverCardFields: string[] = [];
          
          if (chartConfig.fieldMappings && Array.isArray(chartConfig.fieldMappings)) {
            // 从 fieldMappings 数组中查找
            const xMapping = chartConfig.fieldMappings.find((m: any) => m?.role === 'x');
            const yMapping = chartConfig.fieldMappings.find((m: any) => m?.role === 'y');
            const pointMapping = chartConfig.fieldMappings.find((m: any) => m?.role === 'point');
            const tooltipMappings = chartConfig.fieldMappings.filter((m: any) => m?.role === 'tooltip');
            
            // 只使用 targetField，这是实际的字段名称
            // 不使用 name，因为 name 可能是显示名称，不是字段名称
            xAxisName = xMapping?.targetField || '';
            yAxisName = yMapping?.targetField || '';
            pointFieldName = pointMapping?.targetField || '';
            hoverCardFields.push(...tooltipMappings.map((m: any) => m?.targetField).filter(Boolean));
          }
          
          // 不再从 axisDisplay 或 fieldAliasMap 读取，因为这些可能包含默认值或显示名称
          // 如果 fieldMappings 中没有找到，说明历史分析结果中没有有效的字段配置
          
          const mappedPrefill: Partial<ChartConfigState> = {
            chartType: cfg?.chartType || cfg?.type || chartConfig.chartType || 'line',
            title: cfg?.title || '',
            xAxisField: xAxisName,
            yAxisField: yAxisName,
            dataPointField: pointFieldName,
            hoverCardFields: hoverCardFields,
            customFields: chartConfig.customFields || []
          };
          
          console.info('[AnalysisPage] 从历史分析结果提取配置', {
            mappedPrefill,
            extractedFrom: {
              fieldMappings: chartConfig.fieldMappings ? `fieldMappings (${chartConfig.fieldMappings.length} items)` : 'none',
              hasFieldMappings: !!chartConfig.fieldMappings,
              fieldMappingsCount: Array.isArray(chartConfig.fieldMappings) ? chartConfig.fieldMappings.length : 0
            },
            note: '只从 fieldMappings.targetField 提取，不使用 axisDisplay（可能包含默认值）'
          });
          
          // 只有当配置中有有效的字段时才设置，避免空配置或默认值覆盖当前配置
          // 检查字段名称不是默认值（"日期"、"数值"等）
          const isDefaultValue = (value: string) => {
            const defaults = ['日期', '数值', 'X 轴', 'Y 轴', 'x', 'y'];
            return defaults.includes(value);
          };
          
          const hasValidXAxis = mappedPrefill.xAxisField && !isDefaultValue(mappedPrefill.xAxisField);
          const hasValidYAxis = mappedPrefill.yAxisField && !isDefaultValue(mappedPrefill.yAxisField);
          
          if (mappedPrefill && (hasValidXAxis || hasValidYAxis)) {
            console.info('[AnalysisPage] 历史分析结果中的配置有效，应用配置', {
              xAxisField: mappedPrefill.xAxisField,
              yAxisField: mappedPrefill.yAxisField,
              hasValidXAxis,
              hasValidYAxis
            });
            setPrefillChartConfig(mappedPrefill);
          } else {
            console.warn('[AnalysisPage] 历史分析结果中的配置无效或包含默认值，跳过', {
              hasXAxis: !!mappedPrefill?.xAxisField,
              hasYAxis: !!mappedPrefill?.yAxisField,
              hasValidXAxis,
              hasValidYAxis,
              xAxisField: mappedPrefill?.xAxisField,
              yAxisField: mappedPrefill?.yAxisField,
              mappedPrefill
            });
          }
        } else {
          console.info('[AnalysisPage] 无图表配置可回填');
          setPrefillChartConfig(null);
        }

        // 回填 AI 提示词（如果存储了）
        const aiPromptFromResult =
          latest.componentConfigs?.['ai-custom']?.prompt ||
          latest.analysisData?.componentConfigs?.['ai-custom']?.prompt ||
          latest.analysisData?.componentConfigs?.insight?.prompt;
        if (aiPromptFromResult) {
          setAiPrompt(aiPromptFromResult);
        }

        setPrefillLoadedForNotebook(selectedNotebookId);
      } catch (error) {
        console.warn('预填历史分析配置失败:', error);
      }
    };
    loadLatestAnalysis();
    // 注意：prefillLoadedForNotebook 不应该在依赖项中，因为我们在函数内部会设置它
    // 这会导致无限循环。我们只需要在 selectedNotebookId 或 step 变化时重新加载
  }, [selectedNotebookId, step]);

  const handleNoteToggle = (noteId: string) => {
    setSelectedNoteIds(prev => {
      const newIds = prev.includes(noteId)
        ? prev.filter(id => id !== noteId)
        : [...prev, noteId];
      console.log('📝 [AnalysisPage] 切换笔记选择', {
        noteId,
        action: prev.includes(noteId) ? '取消选择' : '选择',
        before: prev.length,
        after: newIds.length,
        selectedNoteIds: newIds
      });
      return newIds;
    });
  };


  const handleDeselectAll = () => {
    setSelectedNoteIds([]);
  };

  const handleComponentToggle = (component: AnalysisComponent) => {
    setSelectedComponents(prev =>
      prev.includes(component)
        ? prev.filter(c => c !== component)
        : [...prev, component]
    );
  };

  const handleSubmit = async () => {
    if (!selectedNotebookId || selectedNoteIds.length === 0 || selectedComponents.length === 0) {
      alert('请完成所有必填项');
      return;
    }

    const notebookType = notebooks.find(nb => nb.notebook_id === selectedNotebookId)?.type || 'custom';
    const normalizedComponents = selectedComponents.map((c) => (c === 'insight' ? 'ai-custom' : c));
    const hasChart = normalizedComponents.includes('chart');
    const hasAI = normalizedComponents.includes('ai-custom');

    setIsSubmitting(true);
    try {
      // 获取字段映射（用于运行分析以及保存配置）
      const nameToIdMap: Record<string, string> = {};
      const fieldTypeMap: Record<string, string> = {};
      try {
        const notebookResponse = await apiClient.get(`/api/notebooks/${selectedNotebookId}`);
        const instances = notebookResponse.data?.notebook?.component_config?.componentInstances || [];
        instances.forEach((inst: any) => {
          const fieldName = inst.title || inst.type;
          if (inst.id && fieldName) {
            nameToIdMap[fieldName] = inst.id;
            fieldTypeMap[fieldName] = inst.type || 'string';
          }
        });
      } catch (mapError) {
        console.warn('[AnalysisPage] 获取笔记本字段失败，使用字段名作为 ID', mapError);
      }

      const mapFieldNameToId = (fieldName?: string) => {
        if (!fieldName) return '';
        return nameToIdMap[fieldName] || fieldName;
      };

      // 先运行分析，生成图表数据和 AI 洞察
      const runResp = await apiClient.post('/api/analysis-run', {
        notebookId: selectedNotebookId,
        noteIds: selectedNoteIds,
        dateRange,
        fields: hasChart
          ? {
              xId: mapFieldNameToId(chartConfigState.xAxisField) || 'created_at',
              xTitle: chartConfigState.xAxisField,
              yId: mapFieldNameToId(chartConfigState.yAxisField) || 'title',
              yTitle: chartConfigState.yAxisField,
              pointId: chartConfigState.dataPointField ? mapFieldNameToId(chartConfigState.dataPointField) : undefined,
              pointTitle: chartConfigState.dataPointField || undefined,
              tooltipIds: Array.isArray(chartConfigState.hoverCardFields)
                ? chartConfigState.hoverCardFields.map(mapFieldNameToId)
                : [],
              tooltipTitles: chartConfigState.hoverCardFields || []
            }
          : {},
        chart: hasChart
          ? {
              chartType: chartConfigState.chartType,
              title: chartConfigState.title
            }
          : {},
        prompt: hasAI ? (aiPrompt || DEFAULT_AI_PROMPT) : undefined
      });

      const runData = runResp.data || {};
      console.log('📊 [AnalysisPage] /api/analysis-run 响应数据:', {
        success: runData?.success,
        hasChart: hasChart,
        hasAI: hasAI,
        chartData: runData?.data?.chart ? '存在' : '不存在',
        aiData: runData?.data?.ai ? '存在' : '不存在',
        chartConfigs: runData?.data?.chart?.chartConfigs?.length || 0,
        insights: runData?.data?.ai?.insights?.length || 0
      });
      
      if (!runData?.success) {
        throw new Error(runData?.message || '生成分析数据失败');
      }

      // 从 runData.data 中提取图表和 AI 数据（注意：后端返回的是 data.chart 和 data.ai）
      const chartData = runData?.data?.chart || runData?.chart;
      const aiData = runData?.data?.ai || runData?.ai;

      const analysisData: any = {
        selectedNotes: {
          notebookId: selectedNotebookId,
          noteIds: selectedNoteIds,
          dateRange: {
            from: dateRange.from || new Date(0).toISOString(),
            to: dateRange.to || new Date().toISOString()
          }
        },
        selectedAnalysisComponents: normalizedComponents,
        componentConfigs: {},
        mode,
        metadata: {
          dataSource: {
            notebookId: selectedNotebookId,
            noteIds: selectedNoteIds,
            dateRange: {
              from: dateRange.from || new Date(0).toISOString(),
              to: dateRange.to || new Date().toISOString()
            }
          }
        }
      };

      if (hasChart && chartData) {
        console.log('📊 [AnalysisPage] 保存图表数据:', {
          chartConfigs: chartData.chartConfigs?.length || 0,
          fieldMappings: chartData.fieldMappings?.length || 0,
          processedData: chartData.processedData ? '存在' : '不存在'
        });
        analysisData.componentConfigs.chart = chartData;
        if (chartData.processedData) {
          analysisData.processedData = chartData.processedData;
        }
      }

      if (hasAI && aiData) {
        console.log('🤖 [AnalysisPage] 保存AI数据:', {
          insights: aiData.insights?.length || 0,
          prompt: aiPrompt || DEFAULT_AI_PROMPT
        });
        analysisData.componentConfigs['ai-custom'] = {
          ...aiData,
          insights: aiData.insights || [],
          prompt: aiPrompt || DEFAULT_AI_PROMPT
        };
      }

      const response = await apiClient.analyzeNotes({
        notebookId: selectedNotebookId,
        notebookType,
        analysisData: {
          ...analysisData,
          selectedAnalysisComponents: normalizedComponents
        },
        mode
      });

      // 如果开启了图表组件，保存配置到 ai_analysis_setting 表
      if (hasChart && chartConfigState) {
        try {
          // 构建 fieldMappings
          const fieldMappings = Object.entries(nameToIdMap)
            .filter(([fieldName]) =>
              fieldName === chartConfigState.xAxisField ||
              fieldName === chartConfigState.yAxisField ||
              fieldName === chartConfigState.dataPointField ||
              (Array.isArray(chartConfigState.hoverCardFields) && chartConfigState.hoverCardFields.includes(fieldName))
            )
            .map(([fieldName, sourceId], index) => ({
              id: `field_${index}`,
              name: fieldName,
              sourceField: sourceId,
              targetField: fieldName,
              dataType: fieldTypeMap[fieldName] || 'string',
              status: 'user_confirmed'
            }));

          // 构建 chart_config
          const chartConfig = {
            chartType: chartConfigState.chartType,
            title: chartConfigState.title || '',
            xAxisField: mapFieldNameToId(chartConfigState.xAxisField),
            yAxisField: mapFieldNameToId(chartConfigState.yAxisField),
            dataPointField: chartConfigState.dataPointField ? mapFieldNameToId(chartConfigState.dataPointField) : '',
            hoverCardFields: Array.isArray(chartConfigState.hoverCardFields)
              ? chartConfigState.hoverCardFields.map(mapFieldNameToId)
              : [],
            aggregateMode: 'none',
            fieldMappings
          };

          // 保存配置
          await apiClient.saveAIAnalysisConfig({
            notebook_id: selectedNotebookId,
            notebook_type: notebookType,
            chart_config: chartConfig,
            analysis_components: normalizedComponents
          });
          console.info('[AnalysisPage] 已保存配置到 ai_analysis_setting');
        } catch (configError) {
          console.warn('[AnalysisPage] 保存配置到 ai_analysis_setting 失败:', configError);
          // 不阻止分析流程，只记录警告
        }
      }

      console.info('[AnalysisPage] 分析请求响应', response);
      
      if (response.success) {
        const analysisId = response.data?.id || response.data?.analysisId;
        console.info('[AnalysisPage] 分析ID', analysisId);
        if (analysisId) {
          const targetPath = `/analysis/${analysisId}`;
          console.info('[AnalysisPage] 准备跳转到:', targetPath);
          navigate(targetPath, { replace: false });
          console.info('[AnalysisPage] 跳转命令已执行');
        } else if (selectedNotebookId) {
          console.info('[AnalysisPage] 未获取到 analysisId，跳转到笔记本分析页面');
          navigate(`/Analysis/${selectedNotebookId}`);
        } else {
          console.warn('[AnalysisPage] 未获取到 notebookId，跳转到分析列表');
          navigate('/analysis');
        }
      } else {
        throw new Error(response.message || '分析失败');
      }
    } catch (error: any) {
      console.error('分析失败:', error);
      alert(error.message || '分析失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef6fd] via-[#eef6fd] to-[#eef6fd]">
      {/* 步骤内容 */}
      {step === 1 && (
        <Step1SelectNotebook
          notebooks={notebooks}
          selectedNotebookId={selectedNotebookId}
          onSelect={setSelectedNotebookId}
          onNext={() => {
            if (!selectedNotebookId) {
              return;
            }
            const params = new URLSearchParams();
            if (selectedNoteIds.length > 0) {
              params.set('noteIds', selectedNoteIds.join(','));
            }
            if (dateRange.from) params.set('from', dateRange.from);
            if (dateRange.to) params.set('to', dateRange.to);
            const query = params.toString();
            navigate(
              query
                ? `/analysis/settingV2/${selectedNotebookId}?${query}`
                : `/analysis/settingV2/${selectedNotebookId}`,
              {
                state: {
                  notebookId: selectedNotebookId,
                  selectedNoteIds,
                  dateRange
                }
              }
            );
          }}
        />
      )}

      {step === 2 && (
        <Step2SelectNotes
          notebookId={selectedNotebookId}
          notebooks={notebooks}
          selectedNoteIds={selectedNoteIds}
          dateRange={dateRange}
          onNotebookSelect={setSelectedNotebookId}
          onNoteToggle={handleNoteToggle}
          onSelectAll={() => {}}
          onDeselectAll={() => {}}
          onDateRangeChange={setDateRange}
        onBack={() => {
            setStep(1);
            setSelectedNotebookId(null);
          }}
          onNext={() => {
            if (selectedNotebookId) {
              const params = new URLSearchParams();
              if (selectedNoteIds.length > 0) {
                params.set('noteIds', selectedNoteIds.join(','));
              }
              if (dateRange.from) params.set('from', dateRange.from);
              if (dateRange.to) params.set('to', dateRange.to);
              const query = params.toString();
              navigate(
                query
                  ? `/analysis/settingV2/${selectedNotebookId}?${query}`
                  : `/analysis/settingV2/${selectedNotebookId}`,
                {
                  state: {
                    notebookId: selectedNotebookId,
                    selectedNoteIds,
                    dateRange
                  }
                }
              );
            }
          }}
        />
      )}

      {step === 3 && (
        <Step3SelectMode
          selectedComponents={selectedComponents}
          onComponentToggle={handleComponentToggle}
          mode={mode}
          onModeChange={setMode}
        onBack={() => {
            // 回到选择页时同步 URL
            const target = `/analysis/select/${selectedNotebookId || ''}`;
            navigate(target, {
              replace: false,
              state: {
                selectedNoteIds,
                dateRange
              }
            });
            setStep(2);
          }}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          notebookId={selectedNotebookId}
          selectedNoteIds={selectedNoteIds}
          dateRange={dateRange}
          onChartConfigChange={setChartConfigState}
          prefillChartConfig={prefillChartConfig}
          initialAIPrompt={aiPrompt}
          onPromptChange={setAiPrompt}
        />
      )}
    </div>
  );
};

export default AnalysisPage;
