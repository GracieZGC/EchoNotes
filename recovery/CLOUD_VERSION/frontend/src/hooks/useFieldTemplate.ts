import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchNotebookFieldTemplate,
  getLastUsedTemplateNotebook,
  saveNotebookFieldTemplate,
  setLastUsedTemplateNotebook
} from '../apiClient';
import { buildDefaultTemplateFields } from '../constants/fieldTemplates';
import type { FieldTemplateField, FieldTemplatePayload, FieldTemplateSource } from '../types/fieldTemplate';

export interface FieldTemplateNotebook {
  notebook_id: string | null;
  name: string;
}

interface UseFieldTemplateOptions {
  source: FieldTemplateSource;
  notebooks: FieldTemplateNotebook[];
}

export const useFieldTemplate = ({ source, notebooks }: UseFieldTemplateOptions) => {
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
  const [templateFields, setTemplateFields] = useState<FieldTemplateField[]>(() =>
    buildDefaultTemplateFields(source)
  );
  const [draftFields, setDraftFields] = useState<FieldTemplateField[]>(() =>
    buildDefaultTemplateFields(source)
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const notebooksSignature = useMemo(
    () => notebooks.map((nb) => nb.notebook_id || 'null').join('|'),
    [notebooks]
  );

  const currentNotebook = useMemo(
    () => notebooks.find((nb) => nb.notebook_id === selectedNotebookId) || null,
    [notebooks, selectedNotebookId]
  );

  const sanitizeTemplateFields = useCallback(
    (fields?: FieldTemplateField[] | null) => {
      const defaults = buildDefaultTemplateFields(source);
      if (!fields?.length) return defaults;

      const incoming = new Map(fields.map((field) => [field.key, field]));
      return defaults.map((field) => {
        const matched = incoming.get(field.key);
        if (!matched) return field;
        return { ...field, enabled: matched.enabled };
      });
    },
    [source]
  );

  const applyTemplateResponse = useCallback(
    (fields: FieldTemplateField[]) => {
      const sanitized = sanitizeTemplateFields(fields);
      setTemplateFields(sanitized);
      setDraftFields(sanitized);
    },
    [sanitizeTemplateFields]
  );

  const fetchTemplate = useCallback(
    async (notebookId: string | null) => {
      if (!notebookId) {
        applyTemplateResponse(buildDefaultTemplateFields(source));
        return;
      }
      setLoading(true);
      try {
        const data = await fetchNotebookFieldTemplate(notebookId, source);
        applyTemplateResponse(data?.fields || buildDefaultTemplateFields(source));
        setError(null);
      } catch (err: any) {
        console.error('❌ 获取字段模板失败:', err);
        setError(err?.message || '加载字段模板失败');
        applyTemplateResponse(buildDefaultTemplateFields(source));
      } finally {
        setLoading(false);
      }
    },
    [applyTemplateResponse, source]
  );

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      if (!notebooks.length) {
        setSelectedNotebookId(null);
        applyTemplateResponse(buildDefaultTemplateFields(source));
        setInitialized(true);
        return;
      }

      setLoading(true);
      try {
        const lastUsed = await getLastUsedTemplateNotebook(source).catch(() => null);
        let resolvedNotebookId: string | null = null;
        if (lastUsed && notebooks.some((nb) => nb.notebook_id === lastUsed)) {
          resolvedNotebookId = lastUsed;
        } else {
          resolvedNotebookId = notebooks[0]?.notebook_id || null;
        }

        if (cancelled) return;
        setSelectedNotebookId(resolvedNotebookId);
        await fetchTemplate(resolvedNotebookId);
      } catch (err: any) {
        if (!cancelled) {
          console.error('❌ 初始化字段模板失败:', err);
          setError(err?.message || '加载字段模板失败');
          applyTemplateResponse(buildDefaultTemplateFields(source));
        }
      } finally {
        if (!cancelled) {
          setInitialized(true);
          setLoading(false);
        }
      }
    };

    initialize();
    return () => {
      cancelled = true;
    };
  }, [fetchTemplate, notebooksSignature, notebooks, source, applyTemplateResponse]);

  useEffect(() => {
    if (!selectedNotebookId) return;
    const exists = notebooks.some((nb) => nb.notebook_id === selectedNotebookId);
    if (!exists) {
      const fallbackId = notebooks[0]?.notebook_id || null;
      setSelectedNotebookId(fallbackId);
      fetchTemplate(fallbackId);
    }
  }, [selectedNotebookId, notebooks, fetchTemplate]);

  const openModal = useCallback(() => {
    setDraftFields(templateFields);
    setModalOpen(true);
    setError(null);
  }, [templateFields]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setError(null);
  }, []);

  const handleNotebookChange = useCallback(
    async (nextNotebookId: string) => {
      const normalizedId = nextNotebookId || null;
      if (normalizedId === selectedNotebookId) return;
      setSelectedNotebookId(normalizedId);
      setError(null);
      try {
        await setLastUsedTemplateNotebook(source, normalizedId);
      } catch (err) {
        console.warn('⚠️ 更新最近使用字段模板失败:', err);
      }
      await fetchTemplate(normalizedId);
    },
    [fetchTemplate, selectedNotebookId, source]
  );

  const toggleField = useCallback((fieldKey: string) => {
    setDraftFields((prev) =>
      prev.map((field) => {
        if (field.key !== fieldKey) return field;
        const currentEnabled = field.enabled !== false;
        return { ...field, enabled: !currentEnabled };
      })
    );
  }, []);

  const setFieldEnabled = useCallback((fieldKey: string, enabled: boolean) => {
    setDraftFields((prev) =>
      prev.map((field) => (field.key === fieldKey ? { ...field, enabled } : field))
    );
  }, []);

  const selectAllFields = useCallback(() => {
    setDraftFields((prev) => prev.map((field) => ({ ...field, enabled: true })));
  }, []);

  const clearAllFields = useCallback(() => {
    setDraftFields((prev) => prev.map((field) => ({ ...field, enabled: false })));
  }, []);

  const resetDraftFields = useCallback(() => {
    setDraftFields(buildDefaultTemplateFields(source));
  }, [source]);

  const hasUnsavedChanges = useMemo(() => {
    const original = JSON.stringify(templateFields);
    const draft = JSON.stringify(draftFields);
    return original !== draft;
  }, [templateFields, draftFields]);

  const saveTemplate = useCallback(async () => {
    if (!selectedNotebookId) return;
    setSaving(true);
    try {
      const payload = await saveNotebookFieldTemplate(selectedNotebookId, source, draftFields);
      applyTemplateResponse(payload.fields || draftFields);
      setError(null);
      setModalOpen(false);
    } catch (err: any) {
      console.error('❌ 保存字段模板失败:', err);
      setError(err?.message || '保存字段模板失败');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [applyTemplateResponse, draftFields, selectedNotebookId, source]);

  const templatePayload: FieldTemplatePayload | null = useMemo(() => {
    if (!selectedNotebookId) return null;
    return {
      notebook_id: selectedNotebookId,
      source_type: source,
      fields: templateFields
    };
  }, [selectedNotebookId, source, templateFields]);

  return {
    notebookId: selectedNotebookId,
    currentNotebook,
    fields: templateFields,
    modalFields: draftFields,
    isModalOpen: modalOpen,
    loading,
    saving,
    error,
    initialized,
    hasUnsavedChanges,
    openModal,
    closeModal,
    selectNotebook: handleNotebookChange,
    toggleField,
    setFieldEnabled,
    selectAllFields,
    clearAllFields,
    resetDraftFields,
    saveTemplate,
    templatePayload,
    setError
  };
};

export type UseFieldTemplateReturn = ReturnType<typeof useFieldTemplate>;
