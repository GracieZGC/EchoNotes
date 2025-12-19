import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import apiClient, { getNotebooks, Notebook as ApiNotebook } from '../apiClient';
import { AnalysisResult, NotebookType } from '../types/Analysis';
import { getFullAnalysisUrl } from '../utils/analysisId';

// 分析结果项组件
const AnalysisItem = ({
  analysis,
  onAnalysisClick,
  onShare,
  notebookName
}: {
  analysis: AnalysisResult;
  onAnalysisClick: (analysisId: string) => void;
  onShare?: (analysis: AnalysisResult) => void;
  notebookName?: string;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // 安全获取字段辅助
  const getNoteCount = () => {
    const fromMeta = analysis.metadata?.dataSource?.noteIds?.length;
    if (typeof fromMeta === 'number') return fromMeta;
    const fromProcessedMeta = (analysis as any).analysisData?.componentConfigs?.chart?.processedData?.metadata?.noteCount;
    if (typeof fromProcessedMeta === 'number') return fromProcessedMeta;
    const notesArr = (analysis as any).analysisData?.processedData?.notes;
    if (Array.isArray(notesArr)) return notesArr.length;
    return undefined;
  };
  const getCreatedAt = () => analysis.metadata?.createdAt || (analysis as any).createdAt || '';
  const getComponentsCount = () =>
    analysis.selectedAnalysisComponents?.length 
      ?? (analysis as any).analysisData?.selectedAnalysisComponents?.length 
      ?? 0;

  const displayTitle = notebookName || '分析结果';
  const componentCount = getComponentsCount();

  const componentLabelMap: Record<string, string> = {
    chart: '图表',
    'ai-custom': 'AI分析',
    insight: 'AI分析',
    summary: '摘要',
    trend: '趋势'
  };

  const metrics = [
    { label: '分析笔记', value: `${getNoteCount() ?? '—'} 条` },
    { 
      label: '分析组件', 
      value: `${componentCount || 0} 个`,
      components: analysis.selectedAnalysisComponents || []
    }
  ];

  const handleShare = async () => {
    if (onShare) {
      onShare(analysis);
      return;
    }
    const url = getFullAnalysisUrl(analysis.id);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        alert('分析链接已复制到剪贴板');
      } else {
        prompt('复制分析页面链接', url);
      }
    } catch (err) {
      console.error('复制链接失败:', err);
      alert('复制失败，请手动复制地址栏链接');
    }
  };

  const createdAt = getCreatedAt();
  const updatedAt =
    (analysis as any).metadata?.updatedAt ||
    (analysis as any).updatedAt ||
    createdAt;
  const formattedCreatedAt = createdAt ? formatDate(createdAt) : '—';
  const formattedUpdatedAt = updatedAt ? formatDate(updatedAt) : '—';

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white/80 px-5 py-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-16 h-12 bg-gradient-to-br from-[#d4f3ed] to-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#0a917a]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0 pt-1 pb-2 space-y-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-gray-900">{displayTitle}</h3>
                {metrics.map(metric => (
                <span key={metric.label} className="inline-flex items-center gap-1 text-sm text-slate-700">
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500 whitespace-nowrap">{metric.label}</span>
                  <span className="font-medium text-[#0a917a] whitespace-nowrap">{metric.value}</span>
                  {metric.components && metric.components.length > 0 && (
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      {metric.components.map((component: string) => (
                        <span
                          key={component}
                          className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#eef6fd] text-[#0a917a] border border-[#d4f3ed]"
                        >
                          {componentLabelMap[component] || component}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              ))}
              </div>
              <div className="text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center gap-2">
                <div>创建时间：{formattedCreatedAt}</div>
                <div className="hidden sm:inline text-slate-300">|</div>
                <div>更新时间：{formattedUpdatedAt}</div>
              </div>
	            </div>

          </div>
        </div>
        <div className="flex-shrink-0 flex flex-col items-center gap-1 translate-y-[-10px]">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <svg viewBox="0 0 1024 1024" className="w-5 h-5" fill="currentColor">
                <path d="M153.6 902.656a32.256 32.256 0 0 1 0-64h716.8a32.256 32.256 0 0 1 0 64zM743.936 151.04l72.192 72.192a51.2 51.2 0 0 1 0 72.192L358.4 751.616a51.2 51.2 0 0 1-36.352 14.848H226.816a25.6 25.6 0 0 1-25.6-25.6v-97.792a51.2 51.2 0 0 1 14.848-36.352l455.68-455.68a51.2 51.2 0 0 1 72.192 0z m-478.72 497.152v54.272h54.272l442.88-442.88L708.096 204.8z" fill="#5A5A68" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                <div className="py-1">
                  <button
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen(false);
                      await handleShare();
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    分享链接
                  </button>
                  <div className="border-t border-gray-100 my-1"></div>
                  <button
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen(false);
                      if (window.confirm('确定删除这个分析结果吗？')) {
                        try {
                          await apiClient.delete(`/api/analysis/${analysis.id}`);
                          window.dispatchEvent(new Event('analysis:refresh'));
                        } catch (error) {
                          console.error('删除失败:', error);
                          alert('删除失败，请重试');
                        }
                      }
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    删除
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => onAnalysisClick(analysis.id)}
            className="px-2 py-1 text-xs text-white bg-[#06c3a8] rounded-md hover:bg-[#04b094] shadow-sm transition-colors -mt-1"
            style={{ fontSize: '10px' }}
          >
            查看详情
          </button>
        </div>
      </div>
    </div>
  );
};

// 分析列表页面主组件
const AnalysisListPage: React.FC = () => {
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<NotebookType | 'all'>('all');
  const [notebookNames, setNotebookNames] = useState<Record<string, string>>({});
  
  // 下拉框状态管理
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement | null>(null);
  const typeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const typeMenuRef = useRef<HTMLDivElement | null>(null);
  const [typeMenuPos, setTypeMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // 获取分析列表
  const fetchAnalyses = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/api/analysis');
      console.log('📊 [AnalysisListPage] API 响应:', response.data);
      
      if (response.data && response.data.success) {
        const data = response.data.data || [];
        console.log('📊 [AnalysisListPage] 获取到分析列表:', data.length, '条');
        setAnalyses(data);
      } else {
        const errorMessage = response.data?.message || '获取分析列表失败';
        console.error('📊 [AnalysisListPage] API 返回失败:', errorMessage);
        setError(errorMessage);
      }
    } catch (error: any) {
      console.error('📊 [AnalysisListPage] 获取分析列表失败:', error);
      const errorMessage = error?.response?.data?.message 
        || error?.message 
        || '无法连接到服务器，请检查网络连接';
      console.error('📊 [AnalysisListPage] 错误详情:', {
        message: errorMessage,
        status: error?.response?.status,
        data: error?.response?.data
      });
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadNotebookNames = async () => {
      try {
        const notebooks: ApiNotebook[] = await getNotebooks();
        const map: Record<string, string> = {};
        notebooks.forEach((notebook) => {
          if (!notebook?.notebook_id) return;
          const displayName = (notebook.name || '').trim() || (notebook.description || '').trim();
          map[notebook.notebook_id] = displayName || notebook.notebook_id;
        });
        setNotebookNames(map);
      } catch (err) {
        console.warn('加载笔记本名称失败:', err);
      }
    };
    loadNotebookNames();
  }, []);

  useEffect(() => {
    fetchAnalyses();
    
    // 监听刷新事件
    const handleRefresh = () => {
      fetchAnalyses();
    };
    
    window.addEventListener('analysis:refresh', handleRefresh);
    return () => {
      window.removeEventListener('analysis:refresh', handleRefresh);
    };
  }, []);

  // 下拉框定位逻辑
  const updateTypeMenuPos = useCallback(() => {
    if (!typeTriggerRef.current) return;
    const rect = typeTriggerRef.current.getBoundingClientRect();
    setTypeMenuPos({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width
    });
  }, []);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        typeDropdownRef.current &&
        !typeDropdownRef.current.contains(event.target as Node) &&
        (!typeMenuRef.current || !typeMenuRef.current.contains(event.target as Node))
      ) {
        setTypeDropdownOpen(false);
      }
    };

    if (typeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [typeDropdownOpen]);

  // 更新下拉菜单位置
  useEffect(() => {
    if (!typeDropdownOpen) {
      setTypeMenuPos(null);
      return;
    }
    updateTypeMenuPos();
    const handler = () => updateTypeMenuPos();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [typeDropdownOpen, updateTypeMenuPos]);

  // 类型选项
  const typeOptions: { value: NotebookType | 'all'; label: string }[] = [
    { value: 'all', label: '所有类型' },
    { value: 'mood', label: '心情分析' },
    { value: 'life', label: '生活分析' },
    { value: 'study', label: '学习分析' },
    { value: 'work', label: '工作分析' },
  ];

  // 过滤分析结果
  const filteredAnalyses = analyses.filter(analysis => {
    const notebookType = analysis.notebookType || 'mood';
    const matchesSearch =
      analysis.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      notebookType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || notebookType === filterType;
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#06c3a8] mx-auto mb-4"></div>
          <p className="text-gray-600">加载分析列表中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={fetchAnalyses}
            className="px-4 py-2 bg-[#06c3a8] text-white rounded-lg hover:bg-[#04b094] shadow-lg shadow-[#8de2d5]"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-6xl mx-auto px-4 pt-0 pb-8">
        {/* 搜索和过滤 */}
        <div className="relative mb-10">
          <div className="rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm">
            <div className="p-6 space-y-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="flex-1 relative">
                  <input
                  type="text"
                  placeholder="搜索分析结果..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                    }
                  }}
                  className="w-full h-[48px] px-4 pr-10 text-[14px] border border-[#90e2d0] rounded-lg focus:outline-none focus:ring-0 focus:border-[#43ccb0]"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="搜索"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
              
              <div className="flex flex-col sm:flex-row items-stretch gap-3">
                <div className="w-full sm:w-[180px]" ref={typeDropdownRef}>
                  <button
                    ref={typeTriggerRef}
                    type="button"
                    onClick={() => setTypeDropdownOpen((v) => !v)}
                    className="w-full h-[48px] min-h-[48px] px-4 rounded-full border border-[#7ddcc7] flex items-center justify-between gap-2 transition-colors bg-white text-[#0a917a] hover:bg-[#f0fffa] text-[14px] leading-[20px] shadow-sm"
                  >
                    <span className="truncate">
                      {typeOptions.find(opt => opt.value === filterType)?.label || '所有类型'}
                    </span>
                    <svg
                      className={`w-4 h-4 transition-transform flex-shrink-0 text-[#0a917a] ${typeDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {typeDropdownOpen && typeMenuPos && createPortal(
                    <div
                      ref={typeMenuRef}
                      className="z-[180] bg-white border border-gray-200 rounded-xl shadow-md"
                      style={{
                        position: 'fixed',
                        top: typeMenuPos.top,
                        left: typeMenuPos.left,
                        width: typeMenuPos.width,
                        background: '#ffffff',
                        backgroundImage: 'none',
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 12px 24px rgba(0,0,0,0.08)',
                        filter: 'none'
                      }}
                    >
                      <div className="p-2 max-h-[300px] overflow-y-auto bg-white">
                        {typeOptions.map((option) => {
                          const isActive = filterType === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setFilterType(option.value);
                                setTypeDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2 rounded-lg transition-colors mt-1 flex items-center gap-2 text-[14px] leading-[14px] ${
                                isActive
                                  ? 'bg-[#f0fffa] text-[#0a917a]'
                                  : 'text-gray-900 hover:bg-[#f0fffa]'
                              }`}
                            >
                              <span className={`w-4 text-sm ${isActive ? 'text-[#0a917a]' : 'text-transparent'}`}>✓</span>
                              <span className="font-medium whitespace-nowrap">{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>,
                    document.body
                  )}
                </div>
                <button
                  onClick={() => {
                    navigate('/analysis/v2');
                  }}
                  className="flex h-[48px] items-center justify-center gap-2 px-5 text-[14px] bg-gradient-to-r from-[#06c3a8] to-[#43ccb0] text-white rounded-2xl shadow-[0_12px_30px_rgba(6,195,168,0.25)] hover:brightness-110 transition-colors w-full sm:w-[180px]"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  新建分析
                </button>
              </div>
            </div>

            </div>
          </div>

          <div className="absolute -bottom-6 right-6 text-xs text-gray-400">
            共 {filteredAnalyses.length} 个分析 · 总计 {analyses.length} 个
          </div>
        </div>

        {/* 分析结果列表 */}
        <div className="space-y-4">
          {filteredAnalyses.map(analysis => {
            const rawNotebookId = analysis.metadata?.dataSource?.notebookId
              || (analysis as any).notebookId
              || '';
            const resolvedName = rawNotebookId ? notebookNames[rawNotebookId] : undefined;

            return (
              <AnalysisItem 
                key={analysis.id} 
                analysis={analysis}
                notebookName={resolvedName}
                onAnalysisClick={() => {
                  if (rawNotebookId) {
                    navigate(`/analysis/v2/${rawNotebookId}`);
                  } else {
                    // 兼容旧数据：没有 notebookId 时仍然跳转到分析详情页
                    navigate(`/analysis/${analysis.id}`);
                  }
                }}
                onShare={(currentAnalysis) => {
                  const url = getFullAnalysisUrl(currentAnalysis.id);
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url)
                      .then(() => alert('分析链接已复制到剪贴板'))
                      .catch(() => alert('复制失败，请手动复制地址栏链接'));
                  } else {
                    prompt('复制分析页面链接', url);
                  }
                }}
	              />
	            );
	          })}
          
          {filteredAnalyses.length === 0 && analyses.length > 0 && (
            <div className="text-center py-16 text-gray-500">
              <p>没有找到匹配的分析结果。</p>
            </div>
          )}

          {filteredAnalyses.length === 0 && analyses.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <p>还没有分析结果，开始创建第一个分析吧！</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalysisListPage;
