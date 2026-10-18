import { describe, expect, it } from 'vitest';
import {
  documentTemplatesEditorPath,
  documentTemplatesListPath,
  isDocumentTemplatesManagedTrack,
  resolveDocumentTemplatesTrackHref,
  resolveDocumentTemplatesTrackRedirect,
} from '../documentTemplatesRouting';
import type { App, Track } from '../../../types';

const baseTrack = (overrides: Partial<Track> = {}): Track =>
  ({
    id: 't1',
    title: 'Templates',
    visibility: 'private',
    owner_id: 'u1',
    created_at: '',
    template_id: 'templates',
    workspace_id: 'ws1',
    ...overrides,
  }) as Track;

const docTemplatesApp: Pick<App, 'source_operational_model_slug' | 'workspace_id' | 'name'> = {
  source_operational_model_slug: 'document_templates',
  workspace_id: 'ws1',
  name: 'Document Templates',
};

describe('isDocumentTemplatesManagedTrack', () => {
  it('matches templates, document_types, and layouts under document_templates app', () => {
    expect(
      isDocumentTemplatesManagedTrack(
        baseTrack({ template_id: 'templates' }),
        'document_templates',
      ),
    ).toBe(true);
    expect(
      isDocumentTemplatesManagedTrack(
        baseTrack({ template_id: 'document_types' }),
        'document_templates',
      ),
    ).toBe(true);
    expect(
      isDocumentTemplatesManagedTrack(
        baseTrack({ template_id: 'layouts' }),
        'document_templates',
      ),
    ).toBe(true);
  });

  it('ignores other apps and track keys', () => {
    expect(
      isDocumentTemplatesManagedTrack(
        baseTrack({ template_id: 'templates' }),
        'hr_app',
      ),
    ).toBe(false);
    expect(
      isDocumentTemplatesManagedTrack(
        baseTrack({ template_id: 'generated_documents' }),
        'document_templates',
      ),
    ).toBe(false);
  });
});

describe('resolveDocumentTemplatesTrackHref', () => {
  it('routes managed tracks to the document-templates list', () => {
    expect(
      resolveDocumentTemplatesTrackHref(baseTrack(), docTemplatesApp),
    ).toBe('/workspaces/ws1/document-templates');
  });

  it('recognizes Core operational-model slug on nested track.app', () => {
    expect(
      resolveDocumentTemplatesTrackHref(
        baseTrack({
          app: {
            source_operational_model_slug: 'document_templates',
            workspace_id: 'ws1',
          } as App,
        }),
      ),
    ).toBe('/workspaces/ws1/document-templates');
  });

  it('routes layouts track to the layouts section', () => {
    expect(
      resolveDocumentTemplatesTrackHref(
        baseTrack({ template_id: 'layouts', id: 't-layout' }),
        docTemplatesApp,
      ),
    ).toBe('/workspaces/ws1/document-templates?section=layouts');
  });

  it('keeps generic track detail for unrelated tracks', () => {
    expect(
      resolveDocumentTemplatesTrackHref(
        baseTrack({ template_id: 'generated_documents', id: 't-gen' }),
        docTemplatesApp,
      ),
    ).toBe('/tracks/t-gen');
  });
});

describe('resolveDocumentTemplatesTrackRedirect', () => {
  it('redirects template entry deeplinks to the editor', () => {
    const params = new URLSearchParams({ entry: 'n.Entry.abc' });
    expect(
      resolveDocumentTemplatesTrackRedirect(
        baseTrack({ app: { source_operational_model_slug: 'document_templates', name: 'Document Templates' } as App }),
        params,
      ),
    ).toBe('/workspaces/ws1/document-templates/n.Entry.abc/edit');
  });

  it('redirects create intent to the list with create query', () => {
    const params = new URLSearchParams({ create: '1' });
    expect(
      resolveDocumentTemplatesTrackRedirect(
        baseTrack({ app: { source_operational_model_slug: 'document_templates', name: 'Document Templates' } as App }),
        params,
      ),
    ).toBe('/workspaces/ws1/document-templates?create=1');
  });

  it('redirects layouts track to the layouts section', () => {
    expect(
      resolveDocumentTemplatesTrackRedirect(
        baseTrack({
          template_id: 'layouts',
          app: { source_operational_model_slug: 'document_templates', name: 'Document Templates' } as App,
        }),
        new URLSearchParams(),
      ),
    ).toBe('/workspaces/ws1/document-templates?section=layouts');
  });

  it('redirects layouts create intent to layouts section with create', () => {
    expect(
      resolveDocumentTemplatesTrackRedirect(
        baseTrack({
          template_id: 'layouts',
          app: { source_operational_model_slug: 'document_templates', name: 'Document Templates' } as App,
        }),
        new URLSearchParams({ create: '1' }),
      ),
    ).toBe('/workspaces/ws1/document-templates?section=layouts&create=1');
  });

  it('does not send document_types entry deeplinks to the template editor', () => {
    const params = new URLSearchParams({ entry: 'n.Entry.type1' });
    expect(
      resolveDocumentTemplatesTrackRedirect(
        baseTrack({
          template_id: 'document_types',
          app: { source_operational_model_slug: 'document_templates', name: 'Document Templates' } as App,
        }),
        params,
      ),
    ).toBe('/workspaces/ws1/document-templates');
  });
});

describe('documentTemplatesListPath', () => {
  it('builds list and create URLs', () => {
    expect(documentTemplatesListPath('ws1')).toBe(
      '/workspaces/ws1/document-templates',
    );
    expect(documentTemplatesListPath('ws1', { create: true })).toBe(
      '/workspaces/ws1/document-templates?create=1',
    );
    expect(documentTemplatesEditorPath('ws1', 'tmpl1')).toBe(
      '/workspaces/ws1/document-templates/tmpl1/edit',
    );
  });
});
