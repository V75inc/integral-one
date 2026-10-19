import { RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Input, Select, Surface, Text } from '../../ui';
import { documentsApi } from './api';

interface Props {
  templateId: string;
  versionId: string;
  contextType: string;
  editorDocument?: Record<string, unknown>;
}

export function TemplatePreviewPanel({
  templateId,
  versionId,
  contextType,
  editorDocument,
}: Props) {
  const [mode, setMode] = useState<'placeholder' | 'live'>('placeholder');
  const [contextEntryId, setContextEntryId] = useState('');
  const [html, setHtml] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  const signatureBlocks = useMemo(() => {
    const out: Array<{ role: string; label: string; mode: string }> = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      if (n.type === 'signaturePlaceholder') {
        const attrs = (n.attrs || {}) as Record<string, unknown>;
        out.push({
          role: String(attrs.role || 'signature'),
          label: String(attrs.label || 'Signature'),
          mode: String(attrs.mode || 'runtime'),
        });
      }
      for (const c of (n.content as unknown[]) || []) walk(c);
    };
    if (editorDocument) walk(editorDocument);
    return out;
  }, [editorDocument]);

  const previewM = useMutation({
    mutationFn: () =>
      documentsApi.preview({
        template_version_id: versionId || undefined,
        template_id: templateId || undefined,
        mode,
        context_entry_id: mode === 'live' ? contextEntryId : undefined,
        editor_document: editorDocument,
      }),
    onSuccess: data => {
      setHtml(typeof data.html === 'string' ? data.html : '');
      setWarnings(data.warnings || []);
    },
  });

  return (
    <Surface as="section" tone="panel" padding="lg">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Text variant="heading-sm" as="h3">
          Preview
        </Text>
        <Select
          aria-label="Preview mode"
          size="sm"
          value={mode}
          onChange={e => setMode(e.target.value as 'placeholder' | 'live')}
        >
          <option value="placeholder">Placeholder</option>
          <option value="live">Live record</option>
        </Select>
        {mode === 'live' ? (
          <Input
            size="sm"
            className="min-w-[220px]"
            placeholder={`${contextType} entry id`}
            value={contextEntryId}
            onChange={e => setContextEntryId(e.target.value)}
          />
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          disabled={
            previewM.isPending ||
            (!versionId && !templateId) ||
            (mode === 'live' && !contextEntryId)
          }
          icon={<RefreshCw size={14} aria-hidden />}
          onClick={() => previewM.mutate()}
        >
          {previewM.isPending ? 'Rendering…' : 'Refresh'}
        </Button>
      </div>
      {signatureBlocks.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {signatureBlocks.map(block => (
            <Surface
              key={`${block.role}-${block.mode}`}
              as="span"
              tone="transparent"
              radius="pill"
              className="inline-flex items-center px-2 py-0.5"
            >
              <Text variant="meta" tone="muted">
                {block.mode === 'pre_embedded' ? 'Pre-embedded' : 'Runtime'}: {block.label}
              </Text>
            </Surface>
          ))}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="mb-2">
          <Text variant="body-sm" tone="warn" as="p">
            {warnings.join(' · ')}
          </Text>
        </div>
      ) : null}
      {previewM.isError ? (
        <div className="mb-2">
          <Text variant="body-sm" tone="danger" as="p">
            {(previewM.error as Error)?.message || 'Preview failed'}
          </Text>
        </div>
      ) : null}
      {html ? (
        <iframe
          className="doc-preview-frame"
          title="Document preview"
          sandbox=""
          srcDoc={html}
        />
      ) : (
        <div className="doc-preview-frame doc-preview-frame--empty">
          <Text variant="body-sm" tone="muted" as="p">
            No preview yet. Click Refresh to render this draft.
          </Text>
        </div>
      )}
    </Surface>
  );
}
