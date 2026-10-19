import { describe, expect, it } from 'vitest';
import { documentTemplateVisibleEntries } from '../useDocumentTemplatesPageContext';
import type { DocumentTemplate } from '../api';

const tmpl = (id: string, name: string): DocumentTemplate => ({
  id,
  name,
  module: 'hr_app',
  document_type: 'employment_contract',
  status: 'active',
  context_type: 'employee',
});

describe('documentTemplateVisibleEntries', () => {
  it('maps templates to entry summaries with cap metadata', () => {
    const templates = Array.from({ length: 10 }, (_, i) =>
      tmpl(`t${i}`, `Template ${i}`),
    );
    const visible = documentTemplateVisibleEntries(templates);
    expect(visible.entries).toHaveLength(8);
    expect(visible.entries[0]).toEqual({
      id: 't0',
      title: 'Template 0',
      status: 'active',
      entry_type: 'template',
    });
    expect(visible.total_count).toBe(10);
  });

  it('omits total_count when under the cap', () => {
    const visible = documentTemplateVisibleEntries([tmpl('t1', 'Offer letter')]);
    expect(visible.entries).toHaveLength(1);
    expect(visible.total_count).toBeUndefined();
  });
});
