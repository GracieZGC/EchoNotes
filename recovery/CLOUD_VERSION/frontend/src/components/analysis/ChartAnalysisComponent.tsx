import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import apiClient from '../../apiClient';

interface ChartAnalysisComponentProps {
  analysisData?: {
    chartConfigs?: any[];
    fieldMappings?: any[];
    processedData?: {
      notes?: any[];
      metadata?: {
        noteIds?: Array<string | number>;
        [key: string]: any;
      };
      [key: string]: any;
    };
    metadata?: {
      dataSource?: {
        noteIds?: Array<string | number>;
        [key: string]: any;
      };
      [key: string]: any;
    };
  };
  onAIClick?: () => void;
  fromAnalysis?: boolean;
  analysisResult?: any;
  filterDateRange?: { from?: string; to?: string };
}

/**
 * 图表分析结果组件
 * 专门用于显示分析结果中的图表数据
 */
function ChartAnalysisComponent({ 
  analysisData, 
  onAIClick, 
  fromAnalysis = false, 
  analysisResult,
  filterDateRange
}: ChartAnalysisComponentProps) {
  const [notesData, setNotesData] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [chartTypeOverrides, setChartTypeOverrides] = useState<Record<string, string>>({});

  const formatDateLabel = (value: any) => {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${month}-${day}`;
    }
    return String(value).slice(0, 10);
  };

  // 获取笔记数据
  useEffect(() => {
    const processedData = analysisData?.processedData;
    const componentMetadata = analysisData?.metadata;
    const analysisMetadata = analysisResult?.metadata;
    const rawNotes = Array.isArray(processedData?.notes)
      ? (processedData?.notes as any[])
      : [];
    const processedMetaIds = Array.isArray(processedData?.metadata?.noteIds)
      ? [...(processedData?.metadata?.noteIds as Array<string | number>)]
      : [];
    const componentMetaIds = Array.isArray(componentMetadata?.dataSource?.noteIds)
      ? [...(componentMetadata?.dataSource?.noteIds as Array<string | number>)]
      : [];
    const analysisMetaIds = Array.isArray(analysisMetadata?.dataSource?.noteIds)
      ? [...(analysisMetadata?.dataSource?.noteIds as Array<string | number>)]
      : [];

    const noteInputs: any[] = [
      ...rawNotes,
      ...processedMetaIds,
      ...componentMetaIds,
      ...analysisMetaIds
    ];

    let canceled = false;

    if (noteInputs.length === 0) {
      setNotesData([]);
      setLoadingNotes(false);
      return () => {
        canceled = true;
      };
    }

    const fetchNotesData = async () => {
      setLoadingNotes(true);
      try {
        const noteMap = new Map<string, any>();
        const idsToFetch = new Set<string>();
        const orderedIds: string[] = [];

        noteInputs.forEach((candidate) => {
          if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
            const id = candidate.note_id || candidate.id || '';
            if (id) {
              if (!orderedIds.includes(String(id))) {
                orderedIds.push(String(id));
              }
              if (candidate.content || candidate.content_text || candidate.component_data) {
                noteMap.set(String(id), candidate);
              } else {
                idsToFetch.add(String(id));
              }
            }
          } else if (candidate !== null && candidate !== undefined) {
            const id = String(candidate);
            if (id && !orderedIds.includes(id)) {
              orderedIds.push(id);
            }
            if (!noteMap.has(id)) {
              idsToFetch.add(id);
            }
          }
        });

        const remainingIds = Array.from(idsToFetch).filter((id) => !noteMap.has(id));
        if (remainingIds.length > 0) {
          const fetchedNotes = (await Promise.all(
            remainingIds.map(async (noteId) => {
              try {
                const response = await apiClient.get(`/api/notes/${noteId}`);
                const note = response.data?.note;
                if (note) {
                  return note;
                }
              } catch (error) {
                console.error(`获取笔记 ${noteId} 失败:`, error);
              }
              return null;
            })
          )).filter(Boolean) as any[];

          fetchedNotes.forEach((note) => {
            const id = note.note_id || note.id || '';
            if (id) {
              noteMap.set(String(id), note);
            }
          });
        }

        const orderedNotes: any[] = [];
        const seen = new Set<string>();
        orderedIds.forEach((id) => {
          if (!id) return;
          const note = noteMap.get(id);
          if (note && !seen.has(id)) {
            orderedNotes.push(note);
            seen.add(id);
          }
        });
        noteMap.forEach((note, id) => {
          if (!seen.has(id)) {
            orderedNotes.push(note);
          }
        });

        if (!canceled) {
          setNotesData(orderedNotes);
        }
      } catch (error) {
        console.error('获取笔记数据失败:', error);
      } finally {
        if (!canceled) {
          setLoadingNotes(false);
        }
      }
    };

    fetchNotesData();

    return () => {
      canceled = true;
    };
  }, [
    analysisData?.processedData?.notes,
    analysisData?.processedData?.metadata?.noteIds,
    analysisData?.metadata?.dataSource?.noteIds,
    analysisResult?.metadata?.dataSource?.noteIds
  ]);
  
  // 如果没有图表配置，尝试从 analysisResult 中获取配置信息，创建空图表
  const chartConfigs = analysisData?.chartConfigs || [];
  const hasChartConfigs = chartConfigs.length > 0;
  
  // 如果没有图表配置，但 analysisResult 中有组件配置，创建一个空图表配置
  let finalChartConfigs = chartConfigs;
  if (!hasChartConfigs && analysisResult) {
    const componentConfigs = analysisResult.componentConfigs || analysisResult.analysisData?.componentConfigs || {};
    const chartConfig = componentConfigs.chart;
    
    if (chartConfig) {
      // 从已有配置中提取信息，创建空图表
      const chartType = chartConfig.chartType || chartConfig.type || 'line';
      const chartTitle = chartConfig.title || '智能分析图表';
      const xField = chartConfig.xAxisField || chartConfig.xField || 'created_at';
      const yField = chartConfig.yAxisField || chartConfig.yField || 'title';
      
      finalChartConfigs = [{
        id: 'chart_0',
        type: chartType,
        config: {
          xField: 'x',
          yField: 'y',
          title: chartTitle,
          xAxis: xField,
          yAxis: yField,
          axisDisplay: {
            x: [xField],
            y: [yField]
          }
        },
        data: [] // 空数据
      }];
    }
  }
  
  // 如果仍然没有图表配置，显示空图表框架
  if (finalChartConfigs.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold text-slate-900">📊 图表分析</h4>
          <div className="text-xs text-slate-400 text-right leading-5">
            <div>X 轴：(未配置)</div>
            <div>Y 轴：(未配置)</div>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-gray-200 p-8">
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">📊</div>
            <div className="text-sm text-gray-500 mb-4">暂无图表配置</div>
            <div className="text-xs text-gray-400">请先配置坐标轴字段</div>
          </div>
        </div>
      </div>
    );
  }

  // 如果正在加载笔记数据，显示加载状态
  if (loadingNotes) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#06c3a8] mx-auto mb-4"></div>
        <div className="text-gray-600 mb-2">📊 正在加载笔记数据...</div>
        <div className="text-sm text-gray-500">准备生成图表数据</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {finalChartConfigs.map((chart, index) => {
        // 处理不同的数据结构格式
        const chartId = chart.id || `chart_${index}`;
        const initialChartType = chart.type || chart.chartType || 'line';
        const overrideChartType = chartTypeOverrides[chartId];
        const chartType = overrideChartType || initialChartType;
        let chartData = chart.data || [];
        let chartConfig: any = chart.config || {};
        const xKey = (chartConfig?.xField)
          || (Array.isArray(chartConfig?.xAxis) ? chartConfig.xAxis[0] : chartConfig?.xAxis)
          || 'x';
        const yKey = (chartConfig?.yField)
          || (Array.isArray(chartConfig?.yAxis) ? chartConfig.yAxis[0] : chartConfig?.yAxis)
          || 'y';
        const categoryValueMap = new Map<string, number>(); // 非数值 Y 值映射成序号
        const categoryLabelMap: Record<number, string> = {};
        const xLabelMap = new Map<number, string>(); // x 数值 -> 显示标签
        const rawYValues = Array.isArray(chartData) ? chartData.map((d: any) => d?.[yKey] ?? d?.y) : [];
        const numericLikeCount = rawYValues.filter((v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))).length;
        const stringLikeCount = rawYValues.filter((v) => typeof v === 'string' && (v.trim() !== '' || v === '') && !Number.isFinite(Number(v))).length;
        const treatYAsText = stringLikeCount > numericLikeCount; // 主要是文本时，不把字符串强转数值
        let yTicks: number[] | undefined;
        let yDomain: [number, number | 'auto'] | undefined;
        let xTicks: number[] | undefined;

        // 可选：按日期范围过滤
        if (filterDateRange && (filterDateRange.from || filterDateRange.to)) {
          const fromStr = filterDateRange.from || '0000-01-01';
          const toStr = filterDateRange.to || '9999-12-31';
          chartData = (chartData || []).filter((pt: any) => {
            const v = pt?.[xKey] ?? pt?.x ?? pt?.date;
            if (!v) return false;
            const s = typeof v === 'string' ? (v.length >= 10 ? v.slice(0, 10) : v) : new Date(v).toISOString().slice(0, 10);
            return s >= fromStr && s <= toStr;
          });
        }

        // 归一化数据：确保 x/y 存在且 y 为数值，过滤掉无法绘制的点
        chartData = (chartData || [])
          .map((item: any, idx: number) => {
            const rawX = item?.[xKey] ?? item?.x ?? item?.date;
            const rawY = item?.[yKey] ?? item?.y;
            let yNumeric: number;
            if (treatYAsText) {
              const key = rawY !== undefined && rawY !== null ? String(rawY) : '';
              if (!categoryValueMap.has(key)) {
                const ordinal = categoryValueMap.size + 1;
                categoryValueMap.set(key, ordinal);
                categoryLabelMap[ordinal] = key;
              }
              yNumeric = categoryValueMap.get(key)!;
            } else {
              const parsedY = typeof rawY === 'number' ? rawY : Number(rawY);
              yNumeric = Number.isFinite(parsedY) ? parsedY : NaN;
            }
            let xNumeric: number;
            let xLabel: string;
            if (typeof rawX === 'number') {
              xNumeric = rawX;
              xLabel = String(rawX);
            } else {
              const dateCandidate = new Date(rawX);
              if (rawX && !Number.isNaN(dateCandidate.getTime())) {
                xNumeric = dateCandidate.getTime();
                xLabel = formatDateLabel(rawX);
              } else {
                xNumeric = idx; // 使用序号保持等距
                xLabel = rawX !== undefined && rawX !== null ? String(rawX) : '';
              }
            }
            xLabelMap.set(xNumeric, xLabel);

            return {
              ...item,
              x: rawX,
              xNumeric,
              xLabel,
              y: rawY,
              yNumeric,
              __rawY: rawY
            };
          })
          .filter((item: any) => {
            if (chartType === 'line' || chartType === 'area') {
              return Number.isFinite(item.yNumeric);
            }
            return item.x !== undefined && item.y !== undefined;
          });

        // 为文本型 Y 轴生成离散刻度，避免 0/2/4 这类数值刻度
        if (treatYAsText && categoryValueMap.size > 0) {
          yTicks = Array.from(categoryValueMap.values()).sort((a, b) => a - b);
          const minTick = yTicks[0];
          const maxTick = yTicks[yTicks.length - 1];
          yDomain = [minTick - 0.5, maxTick + 0.5];
        }

        // 按 xNumeric 排序，计算最小间隔并在首尾补一段等距留白
        const sortedByX = [...chartData].sort((a, b) => a.xNumeric - b.xNumeric);
        // 记录非补白点的刻度，用于 X 轴显示
        xTicks = sortedByX.filter((d) => !d.__syntheticPoint).map((d) => d.xNumeric);
        const gaps = sortedByX
          .map((d, i) => (i === 0 ? Infinity : d.xNumeric - sortedByX[i - 1].xNumeric))
          .filter((gap) => Number.isFinite(gap) && gap > 0);
        const baseGap = gaps.length > 0 ? Math.min(...gaps) : 1;
        const paddingStep = baseGap || 1;
        if (sortedByX.length > 0) {
          const paddedData = [
            {
              xNumeric: sortedByX[0].xNumeric - paddingStep,
              xLabel: '',
              __syntheticPoint: true
            },
            ...sortedByX,
            {
              xNumeric: sortedByX[sortedByX.length - 1].xNumeric + paddingStep,
              xLabel: '',
              __syntheticPoint: true
            }
          ];
          chartData = paddedData;
        } else {
          chartData = [];
        }

        const chartTitle = (() => {
          const rawTitle = (chartConfig.title || '').trim();
          const typeLabel = getChartTypeLabel(chartType);
          if (
            rawTitle === '' ||
            rawTitle === '智能分析图表' ||
            /^图表\s*\d+$/u.test(rawTitle)
          ) {
            return typeLabel || `图表 ${index + 1}`;
          }
          return rawTitle;
        })();

        const displayXAxisName = (() => {
          // 优先从 axisDisplay 读取（后端返回的格式）
          if (chartConfig.axisDisplay?.x && Array.isArray(chartConfig.axisDisplay.x) && chartConfig.axisDisplay.x.length > 0) {
            return chartConfig.axisDisplay.x[0];
          }
          // 从 fieldAliasMap 读取（如果有）
          if (chartConfig.fieldAliasMap && chartConfig.fieldAliasMap.x) {
            return chartConfig.fieldAliasMap.x;
          }
          // 从 xAxis 或 xField 读取
          const xAxis = chartConfig.xAxis || chartConfig.xField;
          if (Array.isArray(xAxis)) return xAxis.filter(Boolean).join('、');
          return xAxis ? String(xAxis) : '—';
        })();

        const displayYAxisName = (() => {
          // 优先从 axisDisplay 读取（后端返回的格式）
          if (chartConfig.axisDisplay?.y && Array.isArray(chartConfig.axisDisplay.y) && chartConfig.axisDisplay.y.length > 0) {
            return chartConfig.axisDisplay.y[0];
          }
          // 从 fieldAliasMap 读取（如果有）
          if (chartConfig.fieldAliasMap && chartConfig.fieldAliasMap.y) {
            return chartConfig.fieldAliasMap.y;
          }
          // 从 yAxis 或 yField 读取
          const yAxis = chartConfig.yAxis || chartConfig.yField;
          if (Array.isArray(yAxis)) return yAxis.filter(Boolean).join('、');
          return yAxis ? String(yAxis) : '—';
        })();

        const displayDataCount = chartData.filter((item: any) => !item?.__syntheticPoint).length;

        const chartReason: string | null = (() => {
          if (typeof (chart as any).reason === 'string' && (chart as any).reason.trim()) {
            return (chart as any).reason.trim();
          }
          if (typeof chartConfig.reason === 'string' && chartConfig.reason.trim()) {
            return chartConfig.reason.trim();
          }
          if (analysisResult?.aiRecommendation && typeof analysisResult.aiRecommendation === 'object') {
            const r = (analysisResult.aiRecommendation as any).reason || (analysisResult.aiRecommendation as any).why;
            if (typeof r === 'string' && r.trim()) return r.trim();
          }
          return null;
        })();

        // 处理多条数据线（如果有 point 字段，按 point 分组）
        const hasMultipleSeries = chartData.some((item: any) => item.point || item.pointField);
        let chartSeries: any[] = [];
        let mergedLineData: any[] = [];
        
        if (hasMultipleSeries && chartType === 'line') {
          // 按 point 值分组
          const seriesMap = new Map<string, any[]>();
          chartData.forEach((item: any) => {
            const pointKey = item.point || item.pointField || 'default';
            if (!seriesMap.has(pointKey)) {
              seriesMap.set(pointKey, []);
            }
            seriesMap.get(pointKey)!.push(item);
          });
          chartSeries = Array.from(seriesMap.entries()).map(([key, data]) => ({
            name: key,
            data: data.sort((a, b) => a.xNumeric - b.xNumeric)
          }));

          // 合并多条线的数据到一个数组，每个 x 值对应多个 y 值
          const xValueMap = new Map<string, any>();
          chartSeries.forEach((series, seriesIndex) => {
            series.data.forEach((item: any) => {
              const xKey = String(item.xNumeric);
              if (!xValueMap.has(xKey)) {
                xValueMap.set(xKey, { x: item.x, xNumeric: item.xNumeric, xLabel: item.xLabel });
              }
              xValueMap.get(xKey)[`y${seriesIndex}`] = item.yNumeric;
            });
          });
          mergedLineData = Array.from(xValueMap.values()).sort((a, b) => {
            return (a.xNumeric as number) - (b.xNumeric as number);
          });
        }

        const renderLineTooltip = ({ active, payload, label }: any) => {
          if (!active || !payload || payload.length === 0) return null;
          const uniqueByKey = payload.filter(
            (item: any, idx: number, arr: any[]) =>
              arr.findIndex((p: any) => p?.dataKey === item?.dataKey) === idx
          );
          const labelText = payload[0]?.payload?.xLabel || xLabelMap.get(label) || formatDateLabel(label);

          return (
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '10px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{labelText}</div>
              {uniqueByKey.map((item: any) => (
                <div key={item.dataKey} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: item.color,
                      marginRight: 6
                    }}
                  />
                  <span style={{ color: '#6b7280', fontSize: 12, marginRight: 6 }}>{displayYAxisName}</span>
                  <span style={{ color: '#111827', fontWeight: 600 }}>
                    {typeof item.value === 'number' ? item.value.toFixed(2) : item.payload?.__rawY || item.value}
                  </span>
                </div>
              ))}
            </div>
          );
        };

        const availableChartTypes: Array<{ value: string; label: string }> = [
          { value: 'line', label: getChartTypeLabel('line') },
          { value: 'bar', label: getChartTypeLabel('bar') },
          { value: 'pie', label: getChartTypeLabel('pie') },
          { value: 'area', label: getChartTypeLabel('area') }
        ];

        const handleChartTypeSelect = (nextType: string) => {
          setChartTypeOverrides(prev => ({
            ...prev,
            [chartId]: nextType
          }));
        };

        return (
          <div key={chartId} className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-slate-900">{chartTitle}</h4>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">图表类型</span>
                  <select
                    value={chartType}
                    onChange={event => handleChartTypeSelect(event.target.value)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#06c3a8]"
                  >
                    {availableChartTypes.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                        {option.value === initialChartType ? '（AI 推荐）' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-slate-400 text-right leading-5">
                  <div>X 轴：({displayXAxisName})</div>
                  <div>Y 轴：({displayYAxisName})</div>
                  {displayDataCount > 0 && (
                    <div className="text-slate-500 mt-1">数据点：{displayDataCount}</div>
                  )}
                </div>
              </div>
            </div>

            <div
              className="rounded-2xl bg-white border border-gray-200 p-6 shadow-md"
              style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}
            >
              {/* 图表内容 */}
              <div className="w-full" style={{ height: chartType === 'pie' ? '300px' : '280px' }}>
                {chartData.length > 0 ? (
                  <>
                    {chartType === 'line' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart 
                          data={mergedLineData.length > 0 ? mergedLineData : chartData} 
                          margin={{ top: 30, right: 30, left: 10, bottom: 10 }}
                        >
                          <defs>
                            <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#FF6347" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#FF6347" stopOpacity={0.05}/>
                            </linearGradient>
                            {chartSeries.length > 0 && chartSeries.map((_, idx) => {
                              const colors = ['#FF6347', '#ffc0cb', '#9370db'];
                              return (
                                <linearGradient key={idx} id={`colorGradient${idx}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={colors[idx % colors.length]} stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor={colors[idx % colors.length]} stopOpacity={0.05}/>
                                </linearGradient>
                              );
                            })}
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                          <XAxis 
                            dataKey="xNumeric" 
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            allowDataOverflow
                            ticks={xTicks}
                            stroke="#000"
                            tick={{ fontSize: 12, fill: '#000' }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => {
                              if (xLabelMap.has(value)) return xLabelMap.get(value)!;
                              // 补白点不显示标签
                              return formatDateLabel(value) || '';
                            }}
                          />
                          <YAxis 
                            stroke="#000"
                            tick={{ fontSize: 12, fill: '#000' }}
                            tickLine={true}
                            axisLine={false}
                            domain={yDomain || [0, 'auto']}
                            ticks={yTicks}
                            allowDecimals={yDomain ? false : true}
                            tickCount={yDomain ? undefined : 5}
                            tickFormatter={(value) => categoryLabelMap[value] || value}
                          />
                          <Tooltip 
                            content={renderLineTooltip}
                          />
                          {chartSeries.length > 0 ? (
                            // 多条线
                            <>
                              {chartSeries.map((series, idx) => {
                                const colors = ['#FF6347', '#ffc0cb', '#9370db']; // 红、粉、紫
                                return (
                                  <React.Fragment key={series.name}>
                                    <Area
                                      type="monotone"
                                      dataKey={`y${idx}`}
                                      stroke={colors[idx % colors.length]}
                                      strokeWidth={2}
                                      fill={`url(#colorGradient${idx})`}
                                    />
                                    <Line 
                                      type="monotone" 
                                      dataKey={`y${idx}`}
                                      stroke={colors[idx % colors.length]}
                                      strokeWidth={2}
                                      dot={{ r: 4, fill: colors[idx % colors.length] }}
                                      activeDot={{ r: 6, fill: colors[idx % colors.length] }}
                                      name="Content"
                                    />
                                  </React.Fragment>
                                );
                              })}
                            </>
                          ) : (
                            // 单条线
                            <>
                              <Area
                                type="monotone"
                                dataKey="yNumeric"
                                stroke="#FF6347"
                                strokeWidth={2}
                                fill="url(#colorGradient)"
                              />
                              <Line 
                                type="monotone" 
                                dataKey="yNumeric" 
                                stroke="#FF6347" 
                                strokeWidth={2}
                                dot={{ r: 4, fill: '#FF6347' }}
                                activeDot={{ r: 6, fill: '#FF6347' }}
                              />
                            </>
                          )}
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : chartType === 'bar' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chartData.filter((item: any) => !item?.__syntheticPoint)}
                          margin={{ top: 30, right: 30, left: 10, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                          <XAxis
                            dataKey="xNumeric"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            allowDataOverflow
                            ticks={xTicks}
                            stroke="#000"
                            tick={{ fontSize: 12, fill: '#000' }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => {
                              if (xLabelMap.has(value)) return xLabelMap.get(value)!;
                              return formatDateLabel(value) || '';
                            }}
                          />
                          <YAxis
                            stroke="#000"
                            tick={{ fontSize: 12, fill: '#000' }}
                            tickLine={true}
                            axisLine={false}
                            domain={yDomain || [0, 'auto']}
                            ticks={yTicks}
                            allowDecimals={yDomain ? false : true}
                            tickCount={yDomain ? undefined : 5}
                            tickFormatter={(value) => categoryLabelMap[value] || value}
                          />
                          <Tooltip content={renderLineTooltip} />
                          <Bar
                            dataKey="yNumeric"
                            fill="#FF6347"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={40}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : chartType === 'area' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={chartData}
                          margin={{ top: 30, right: 30, left: 10, bottom: 10 }}
                        >
                          <defs>
                            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#FF6347" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#FF6347" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                          <XAxis
                            dataKey="xNumeric"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            allowDataOverflow
                            ticks={xTicks}
                            stroke="#000"
                            tick={{ fontSize: 12, fill: '#000' }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => {
                              if (xLabelMap.has(value)) return xLabelMap.get(value)!;
                              return formatDateLabel(value) || '';
                            }}
                          />
                          <YAxis
                            stroke="#000"
                            tick={{ fontSize: 12, fill: '#000' }}
                            tickLine={true}
                            axisLine={false}
                            domain={yDomain || [0, 'auto']}
                            ticks={yTicks}
                            allowDecimals={yDomain ? false : true}
                            tickCount={yDomain ? undefined : 5}
                            tickFormatter={(value) => categoryLabelMap[value] || value}
                          />
                          <Tooltip content={renderLineTooltip} />
                          <Area
                            type="monotone"
                            dataKey="yNumeric"
                            stroke="#FF6347"
                            strokeWidth={2}
                            fill="url(#areaGradient)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : chartType === 'pie' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData.map((item: any, index: number) => ({
                              name: item.title || `Item ${index + 1}`,
                              value: typeof item.y === 'number' ? item.y : Number(item.y) || 0
                            }))}
                            cx="40%"
                            cy="50%"
                            labelLine={false}
                            label={({ percent }) => {
                              const normalized = typeof percent === 'number' ? percent : 0;
                              return `${(normalized * 100).toFixed(0)}%`;
                            }}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {chartData.map((entry: any, index: number) => {
                              // 使用图片中的颜色：紫色、粉色、浅蓝色
                              const colors = ['#9370db', '#ffc0cb', '#87ceeb']; // 紫、粉、浅蓝
                              return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                            })}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px' }}
                            formatter={(value: any) => [typeof value === 'number' ? value.toFixed(2) : value, 'Value']}
                          />
                          <Legend 
                            wrapperStyle={{ paddingTop: '20px', paddingLeft: '60%' }}
                            formatter={(value) => 'Content'}
                            iconType="circle"
                            align="left"
                            verticalAlign="middle"
                            layout="vertical"
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        不支持的图表类型: {chartType}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-gray-400 mb-2 text-4xl">📊</div>
                    <div className="text-sm text-gray-500 mb-2">暂无数据点</div>
                    <div className="text-xs text-gray-400">
                      {displayXAxisName !== '—' && displayYAxisName !== '—' 
                        ? `已配置坐标轴：X轴(${displayXAxisName})，Y轴(${displayYAxisName})，但所选笔记中没有匹配的数据`
                        : '请先配置坐标轴字段'}
                    </div>
                    {/* 显示空的图表框架 */}
                    <div className="mt-6 border-2 border-dashed border-gray-300 rounded-lg p-8 bg-gray-50">
                      <div className="flex items-end justify-center h-48 space-x-2">
                        {/* 显示空的坐标轴 */}
                        <div className="flex flex-col items-center h-full">
                          <div className="flex-1 flex items-end">
                            <div className="text-xs text-gray-400 mb-1">Y轴</div>
                          </div>
                          <div className="w-full border-t-2 border-gray-400"></div>
                          <div className="text-xs text-gray-400 mt-1">X轴</div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 mt-4">
                        {chartType === 'line' ? '折线图' : 
                         chartType === 'bar' ? '柱状图' : 
                         chartType === 'pie' ? '饼图' : 
                         chartType === 'scatter' ? '散点图' : 
                         chartType === 'area' ? '面积图' : '图表'} 框架（等待数据）
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 获取图表类型的中文标签
 */
function getChartTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'bar': '柱状图',
    'line': '折线图',
    'pie': '饼图',
    'scatter': '散点图',
    'area': '面积图',
    'radar': '雷达图'
  };
  return labels[type] || type;
}

export default ChartAnalysisComponent;
