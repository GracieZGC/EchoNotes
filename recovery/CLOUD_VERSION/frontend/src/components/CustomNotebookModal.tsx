import React, { useCallback, useMemo, useState } from 'react';
import apiClient from '../apiClient';
import {
  smartSync,
  type ComponentInstance,
  getComponentConfig,
  getComponentTitle,
  type ComponentConfig
} from '../utils/componentSync';
import {
  recordComponentTypes,
  analysisComponentTypes,
  chartTypes
} from '../utils/componentTypes';

type CustomNotebookModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

const generateInstanceId = (type: string) =>
  `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createInstance = (type: string): ComponentInstance => ({
  id: generateInstanceId(type),
  type,
  title: getComponentTitle(type),
  config: getComponentConfig(type)
});

const CustomNotebookModal: React.FC<CustomNotebookModalProps> = ({ open, onClose, onCreated }) => {
  const [customNotebookName, setCustomNotebookName] = useState('');
  const [customNotebookDescription, setCustomNotebookDescription] = useState('');
  const [componentInstances, setComponentInstances] = useState<ComponentInstance[]>([]);
  const [selectedRecordComponents, setSelectedRecordComponents] = useState<string[]>([]);
  const [selectedAnalysisComponents, setSelectedAnalysisComponents] = useState<string[]>([]);

  const resetForm = useCallback(() => {
    setCustomNotebookName('');
    setCustomNotebookDescription('');
    setComponentInstances([]);
    setSelectedRecordComponents([]);
    setSelectedAnalysisComponents([]);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const addInstance = (type: string) => {
    setComponentInstances((prev) => [...prev, createInstance(type)]);
  };

  const removeInstance = (instanceId: string) => {
    setComponentInstances((prev) => prev.filter((instance) => instance.id !== instanceId));
  };

  const removeComponentType = (type: string) => {
    setComponentInstances((prev) => prev.filter((instance) => instance.type !== type));
    setSelectedRecordComponents((prev) => prev.filter((id) => id !== type));
    setSelectedAnalysisComponents((prev) => prev.filter((id) => id !== type));
  };

  const toggleRecordComponent = (type: string) => {
    setSelectedRecordComponents((prev) => {
      if (prev.includes(type)) {
        removeComponentType(type);
        return prev.filter((item) => item !== type);
      }
      addInstance(type);
      return [...prev, type];
    });
  };

  const addAnalysisComponent = (type: string) => {
    if (!selectedAnalysisComponents.includes(type)) {
      setSelectedAnalysisComponents((prev) => [...prev, type]);
    }
    addInstance(type);
  };

  const updateInstanceTitle = (instanceId: string, title: string) => {
    setComponentInstances((prev) =>
      prev.map((instance) =>
        instance.id === instanceId
          ? { ...instance, title: title.trim() || getComponentTitle(instance.type) }
          : instance
      )
    );
  };

  const updateInstanceConfig = (instanceId: string, config: Record<string, unknown>) => {
    setComponentInstances((prev) =>
      prev.map((instance) =>
        instance.id === instanceId
          ? { ...instance, config: { ...(instance.config || {}), ...config } }
          : instance
      )
    );
  };

  const instancesOfType = useCallback(
    (type: string) => componentInstances.filter((instance) => instance.type === type),
    [componentInstances]
  );

  const recordComponentInstances = useMemo(
    () =>
      selectedRecordComponents.map((componentId) => ({
        component: recordComponentTypes.find((item) => item.id === componentId),
        instances: instancesOfType(componentId)
      })),
    [instancesOfType, selectedRecordComponents]
  );

  const analysisComponentInstances = useMemo(
    () =>
      analysisComponentTypes.map((component) => ({
        component,
        instances: instancesOfType(component.id)
      })),
    [instancesOfType]
  );

  const handleCreateCustomNotebook = async () => {
    const trimmedName = customNotebookName.trim();
    if (!trimmedName) {
      alert('请输入笔记本名称');
      return;
    }

    if (componentInstances.length === 0) {
      alert('请至少选择一个组件字段');
      return;
    }

    const componentConfig: ComponentConfig = {
      componentInstances: componentInstances.map(({ content, ...rest }) => rest)
    };

    try {
      const { data } = await apiClient.post('/api/notebooks', {
        name: trimmedName,
        description: customNotebookDescription.trim() || undefined,
        componentConfig
      });

      if (!data?.success) {
        throw new Error(data?.message || '创建笔记本失败');
      }

      if (data.notebook?.notebook_id) {
        await smartSync(data.notebook.notebook_id, componentInstances, 'notebook');
        window.dispatchEvent(
          new CustomEvent('notebook:created', { detail: { id: data.notebook.notebook_id } })
        );
      }

      resetForm();
      onClose();
      onCreated?.();
    } catch (error) {
      console.error('创建笔记本失败:', error);
      alert((error as Error).message || '创建笔记本失败');
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">自定义笔记本结构</h3>
            <p className="text-sm text-slate-500 mt-1">配置结构化记录字段与 AI/图表组件</p>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-6 space-y-8">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              笔记本名称
              <input
                type="text"
                value={customNotebookName}
                onChange={(e) => setCustomNotebookName(e.target.value)}
                className="mt-2 w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#43ccb0] outline-none"
                placeholder="例如：财经分析、学习备忘..."
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              描述（可选）
              <textarea
                value={customNotebookDescription}
                onChange={(e) => setCustomNotebookDescription(e.target.value)}
                rows={3}
                className="mt-2 w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#43ccb0] outline-none resize-none"
                placeholder="为笔记本提供一句描述，方便 AI 推荐。"
              />
            </label>
          </div>

          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-800">记录组件</h4>
                <p className="text-xs text-slate-500">勾选需要的字段，可为每个字段添加多个实例</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {recordComponentTypes.map((component) => {
                const active = selectedRecordComponents.includes(component.id);
                return (
                  <button
                    key={component.id}
                    type="button"
                    onClick={() => toggleRecordComponent(component.id)}
                    className={`p-3 border rounded-xl transition-colors text-left ${
                      active
                        ? 'border-[#43ccb0] bg-[#eef6fd] text-[#0a6154]'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-2xl mb-1">{component.icon}</div>
                    <div className="text-sm font-semibold">{component.label}</div>
                    <div className="text-xs text-slate-500 mt-1">{component.description}</div>
                  </button>
                );
              })}
            </div>

            {recordComponentInstances.length > 0 && (
              <div className="mt-4 space-y-4">
                {recordComponentInstances.map(({ component, instances }) => {
                  if (!component) return null;
                  return (
                    <div
                      key={component.id}
                      className="border border-slate-200 rounded-2xl p-4 bg-slate-50"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{component.icon}</span>
                          <div>
                            <div className="font-semibold text-slate-800">{component.label}</div>
                            <div className="text-xs text-slate-500">
                              已添加 {instances.length} 个字段实例
                            </div>
                          </div>
                        </div>
                        <button
                          className="text-xs text-red-500 hover:text-red-600"
                          onClick={() => removeComponentType(component.id)}
                        >
                          删除该组件
                        </button>
                      </div>
                      <div className="space-y-3">
                        {instances.map((instance) => (
                          <div
                            key={instance.id}
                            className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2 md:flex-row md:items-center"
                          >
                            <input
                              type="text"
                              value={instance.title}
                              onChange={(e) => updateInstanceTitle(instance.id, e.target.value)}
                              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#43ccb0] outline-none"
                              placeholder="字段标题"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="px-3 py-1 text-xs border border-slate-200 rounded-lg hover:border-slate-300"
                                onClick={() => addInstance(component.id)}
                              >
                                复制
                              </button>
                              <button
                                type="button"
                                className="px-3 py-1 text-xs border border-slate-200 rounded-lg hover:border-slate-300 text-red-500"
                                onClick={() => removeInstance(instance.id)}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-800">分析组件</h4>
                <p className="text-xs text-slate-500">AI 摘要与图表组件可多次添加</p>
              </div>
              <div className="flex gap-2">
                {analysisComponentTypes.map((component) => (
                  <button
                    key={component.id}
                    type="button"
                    onClick={() => addAnalysisComponent(component.id)}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:border-[#6bd8c0]"
                  >
                    {component.icon} 添加{component.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {analysisComponentInstances.map(({ component, instances }) => {
                if (instances.length === 0) return null;
                return (
                  <div
                    key={component.id}
                    className="border border-slate-200 rounded-2xl p-4 bg-slate-50"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{component.icon}</span>
                        <div>
                          <div className="font-semibold text-slate-800">{component.label}</div>
                          <div className="text-xs text-slate-500">{component.description}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-red-500 hover:text-red-600"
                        onClick={() => removeComponentType(component.id)}
                      >
                        删除该组件
                      </button>
                    </div>

                    <div className="space-y-4">
                      {instances.map((instance) => (
                        <div
                          key={instance.id}
                          className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
                        >
                          <div className="flex flex-col gap-2 md:flex-row md:items-center">
                            <input
                              type="text"
                              value={instance.title}
                              onChange={(e) => updateInstanceTitle(instance.id, e.target.value)}
                              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#43ccb0] outline-none"
                              placeholder={`${component.label}标题`}
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="px-3 py-1 text-xs border border-slate-200 rounded-lg hover:border-slate-300"
                                onClick={() => addAnalysisComponent(component.id)}
                              >
                                复制
                              </button>
                              <button
                                type="button"
                                className="px-3 py-1 text-xs border border-slate-200 rounded-lg hover:border-slate-300 text-red-500"
                                onClick={() => removeInstance(instance.id)}
                              >
                                删除
                              </button>
                            </div>
                          </div>

                          {component.id === 'ai-custom' && (
                            <textarea
                              value={String(instance.config?.prompt || '')}
                              onChange={(e) =>
                                updateInstanceConfig(instance.id, { prompt: e.target.value })
                              }
                              rows={3}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#43ccb0] outline-none resize-none text-sm"
                              placeholder="输入 AI 提示词，例如：请将内容总结为 5 条投资洞察..."
                            />
                          )}

                          {component.id === 'chart' && (
                            <div>
                              <p className="text-xs text-slate-500 mb-2">选择图表类型</p>
                              <div className="grid grid-cols-3 gap-2">
                                {chartTypes.map((chart) => (
                                  <button
                                    key={chart.id}
                                    type="button"
                                    onClick={() =>
                                      updateInstanceConfig(instance.id, {
                                        chartType: chart.id
                                      })
                                    }
                                    className={`p-2 border rounded-lg text-xs flex flex-col items-center gap-1 ${
                                      instance.config?.chartType === chart.id
                                        ? 'border-[#43ccb0] bg-[#eef6fd] text-[#0a6154]'
                                        : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                  >
                                    <span className="text-lg">{chart.icon}</span>
                                    {chart.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleCreateCustomNotebook}
              disabled={!customNotebookName.trim() || componentInstances.length === 0}
              className="px-5 py-2 rounded-lg bg-[#06c3a8] text-white shadow-lg shadow-[#8de2d5] disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              创建笔记本
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomNotebookModal;
