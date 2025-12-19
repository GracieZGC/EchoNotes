import type { FieldTemplateField, FieldTemplateSource } from '../types/fieldTemplate';

export const FIELD_TEMPLATE_DEFINITIONS: Array<Omit<FieldTemplateField, 'enabled' | 'order'>> = [
  { key: 'title', label: '标题' },
  { key: 'content', label: '正文' },
  { key: 'summary', label: 'AI总结' },
  { key: 'keywords', label: '关键词' },
  { key: 'img_urls', label: '图片' },
  { key: 'source_url', label: '原文链接' },
  { key: 'author', label: '作者' },
  { key: 'published_at', label: '发布时间' },
  { key: 'source_platform', label: '来源平台' },
  { key: 'note_type', label: '笔记类型' },
  { key: 'note_created_at', label: '笔记创建时间' }
];

const SOURCE_DEFAULT_KEYS: Record<FieldTemplateSource, string[]> = {
  link: [
    'title',
    'content',
    'summary',
    'keywords',
    'img_urls',
    'source_url',
    'author',
    'published_at',
    'source_platform',
    'note_type',
    'note_created_at'
  ],
  manual: [
    'title',
    'content',
    'summary',
    'keywords',
    'img_urls',
    'published_at',
    'source_platform',
    'note_type',
    'note_created_at'
  ]
};

export const buildDefaultTemplateFields = (source: FieldTemplateSource): FieldTemplateField[] => {
  const enabledKeys = new Set(SOURCE_DEFAULT_KEYS[source] || []);
  return FIELD_TEMPLATE_DEFINITIONS.map((definition, index) => ({
    key: definition.key,
    label: definition.label,
    enabled: enabledKeys.has(definition.key),
    order: index
  }));
};
