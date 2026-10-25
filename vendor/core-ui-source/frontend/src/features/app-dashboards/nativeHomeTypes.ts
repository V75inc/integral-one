export interface HomeInput { name: string; label: string; type?: 'text' | 'textarea' | 'number' | 'email' | 'checkbox'; required?: boolean }
export interface HomeElement {
  id: string;
  type: 'stack' | 'grid' | 'card' | 'heading' | 'text' | 'markdown' | 'metric' | 'chart' | 'records' | 'form' | 'action' | 'tabs' | 'accordion';
  title?: string; text?: string; children?: HomeElement[]; columns?: number; gap?: 'sm' | 'md' | 'lg';
  query_key?: string; params?: Record<string, unknown>; value_path?: string; rows_path?: string;
  label_field?: string; value_field?: string; chart_type?: 'bar' | 'line' | 'pie';
  fields?: HomeInput[]; operation_key?: string; payload?: Record<string, unknown>; submit_label?: string;
}
