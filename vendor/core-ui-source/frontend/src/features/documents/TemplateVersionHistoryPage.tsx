import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { PageHeading, PageMeta, PageShell, PageSection, Button } from '../../components/ui';
import { Surface, Text } from '../../ui';
import { documentsApi, type DocumentTemplateVersion } from './api';
import { useDocumentTemplatesPageContext } from './useDocumentTemplatesPageContext';

function summarizeDoc(v: DocumentTemplateVersion): string {
  const tokens = v.token_metadata?.tokens || [];
  const keys = tokens
    .map(t => String(t.field_key || t.fieldKey || ''))
    .filter(Boolean);
  return [
    `status=${v.status}`,
    `tokens=${keys.length}`,
    keys.slice(0, 8).join(', ') || '(no tokens)',
  ].join(' · ');
}

export function TemplateVersionHistoryPage() {
  const { workspaceId = '', templateId = '' } = useParams();
  const qc = useQueryClient();
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');

  const versionsQ = useQuery({
    queryKey: ['document-template-versions', templateId],
    queryFn: () => documentsApi.listVersions(templateId),
    enabled: Boolean(templateId),
  });

  const restoreM = useMutation({
    mutationFn: (versionId: string) => documentsApi.restoreVersion(versionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-template-versions', templateId] });
      qc.invalidateQueries({ queryKey: ['document-template', templateId] });
    },
  });

  const publishM = useMutation({
    mutationFn: (versionId: string) => documentsApi.publishVersion(versionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-template-versions', templateId] });
      qc.invalidateQueries({ queryKey: ['document-template', templateId] });
    },
  });

  const versions = versionsQ.data?.versions || [];

  const templateQ = useQuery({
    queryKey: ['document-template', templateId],
    queryFn: () => documentsApi.getTemplate(templateId),
    enabled: Boolean(templateId),
  });

  useDocumentTemplatesPageContext(
    workspaceId && templateId && !versionsQ.isLoading
      ? {
          surface: 'versions',
          workspaceId,
          templateId,
          templateName: templateQ.data?.template.name,
          versionCount: versions.length,
        }
      : null,
  );

  const comparison = useMemo(() => {
    if (!compareA || !compareB) return null;
    const a = versions.find(v => v.id === compareA);
    const b = versions.find(v => v.id === compareB);
    if (!a || !b) return null;
    const aKeys = new Set(
      (a.token_metadata?.tokens || [])
        .map(t => String(t.field_key || t.fieldKey || ''))
        .filter(Boolean),
    );
    const bKeys = new Set(
      (b.token_metadata?.tokens || [])
        .map(t => String(t.field_key || t.fieldKey || ''))
        .filter(Boolean),
    );
    const onlyA = [...aKeys].filter(k => !bKeys.has(k));
    const onlyB = [...bKeys].filter(k => !aKeys.has(k));
    const shared = [...aKeys].filter(k => bKeys.has(k));
    return { a, b, onlyA, onlyB, shared };
  }, [compareA, compareB, versions]);

  return (
    <PageShell>
      <PageSection>
        <div className="flex items-start justify-between gap-4">
          <div>
            <PageHeading>Template versions</PageHeading>
            <PageMeta as="p">
              Published versions are immutable. Restore forks content into a new
              draft.
            </PageMeta>
          </div>
          <Link
            className="text-sm text-[var(--accent)]"
            to={`/workspaces/${workspaceId}/document-templates/${templateId}/edit`}
          >
            Back to editor
          </Link>
        </div>
      </PageSection>
      <PageSection className="mt-8">
        <div className="overflow-x-auto rounded-lg border border-[var(--panel-border)]">
          <table className="w-full text-sm">
            <Surface as="thead" tone="panel" border="none" radius="none" className="text-left">
              <tr>
                <th className="px-3 py-2">Version</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Published</th>
                <th className="px-3 py-2">Checksum</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </Surface>
            <tbody>
              {versions.map(v => (
                <tr key={v.id} className="border-t border-[var(--panel-border)]">
                  <td className="px-3 py-2">v{v.version_number}</td>
                  <td className="px-3 py-2">{v.status}</td>
                  <td className="px-3 py-2">{v.published_at || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {(v.checksum || '').slice(0, 12) || '—'}
                  </td>
                  <td className="px-3 py-2 space-x-2">
                    {v.status === 'draft' ? (
                      <Button size="sm" onClick={() => publishM.mutate(v.id)}>
                        Publish
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => restoreM.mutate(v.id)}
                      >
                        Restore as draft
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageSection>
      <PageSection className="mt-8">
        <h3 className="text-sm font-semibold mb-3">Compare versions</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          <select
            className="rounded border border-[var(--panel-border)] px-2 py-1 text-sm"
            value={compareA}
            onChange={e => setCompareA(e.target.value)}
          >
            <option value="">Version A…</option>
            {versions.map(v => (
              <option key={v.id} value={v.id}>
                v{v.version_number} ({v.status})
              </option>
            ))}
          </select>
          <select
            className="rounded border border-[var(--panel-border)] px-2 py-1 text-sm"
            value={compareB}
            onChange={e => setCompareB(e.target.value)}
          >
            <option value="">Version B…</option>
            {versions.map(v => (
              <option key={v.id} value={v.id}>
                v{v.version_number} ({v.status})
              </option>
            ))}
          </select>
        </div>
        {comparison ? (
          <div className="rounded-lg border border-[var(--panel-border)] p-3 text-sm space-y-2">
            <p>
              <strong>A:</strong> {summarizeDoc(comparison.a)}
            </p>
            <p>
              <strong>B:</strong> {summarizeDoc(comparison.b)}
            </p>
            <p>Shared tokens: {comparison.shared.join(', ') || '—'}</p>
            <p>Only in A: {comparison.onlyA.join(', ') || '—'}</p>
            <p>Only in B: {comparison.onlyB.join(', ') || '—'}</p>
          </div>
        ) : (
          <Text as="p" variant="body" tone="muted">
            Select two versions to compare field-token sets.
          </Text>
        )}
      </PageSection>
    </PageShell>
  );
}
