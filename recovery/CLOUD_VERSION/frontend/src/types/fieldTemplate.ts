export type FieldTemplateSource = 'link' | 'manual';

export interface FieldTemplateField {
  key: string;
  label: string;
  enabled: boolean;
  order: number;
}

export interface FieldTemplatePayload {
  notebook_id: string | null;
  source_type: FieldTemplateSource;
  fields: FieldTemplateField[];
}
