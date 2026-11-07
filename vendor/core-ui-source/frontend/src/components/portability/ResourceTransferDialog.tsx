import { useEffect, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button, LINE_ICON_STROKE } from '../ui';
import { Input, Surface, Text } from '../../ui';
import { FormDialog } from '../../templates';
import { useToast } from '../../context/ToastContext';
import { portableApi, type ExportMode, type ResourceKind, type TransferSummary } from '../../api/portable';

type Item = { id: string; name?: string; title?: string };
interface Props {
  open: boolean;
  kind: ResourceKind;
  workspaceId: string;
  appId?: string;
  onClose(): void;
  onImported?(): void;
}

function countLabel(count: number, single: string, plural = `${single}s`) {
  return `${count} ${count === 1 ? single : plural}`;
}

function message(error: unknown): string {
  const value = error as { response?: { data?: { detail?: string | { message?: string }; message?: string } }; message?: string };
  const data = value.response?.data;
  return (typeof data?.detail === 'string' ? data.detail : data?.detail?.message) || data?.message || value.message || 'Transfer failed. Please try again.';
}

export function ResourceTransferDialog({ open, kind, workspaceId, appId, onClose, onImported }: Props) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [mode, setMode] = useState<ExportMode>('configuration');
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TransferSummary | null>(null);
  const [filter, setFilter] = useState('');
  const generation = useRef(0);
  const title = kind === 'app' ? 'Apps' : 'Tracks';

  useEffect(() => {
    const current = ++generation.current;
    if (!open) return;
    setTab('export'); setMode('configuration'); setSelected(new Set()); setFile(null);
    setPreview(null); setBusy(false); setFilter(''); setItems([]); setCursor(undefined); setFailed(false); setLoading(true);
    portableApi.list(kind, undefined, appId).then(page => {
      if (generation.current !== current) return;
      setItems(page.items); setCursor(page.cursor);
    }).catch(error => {
      if (generation.current !== current) return;
      setFailed(true); showToast(message(error), 'error');
    }).finally(() => { if (generation.current === current) setLoading(false); });
    return () => { generation.current++; };
  }, [open, workspaceId, kind, appId, showToast]);

  const more = async () => {
    const current = generation.current;
    setLoading(true);
    try {
      const page = await portableApi.list(kind, cursor, appId);
      if (generation.current !== current) return;
      setItems(previous => [...new Map([...previous, ...page.items].map(item => [item.id, item])).values()]);
      setCursor(page.cursor === cursor ? undefined : page.cursor); setFailed(false);
    } catch (error) { if (generation.current === current) { setFailed(true); showToast(message(error), 'error'); } }
    finally { if (generation.current === current) setLoading(false); }
  };

  const confirm = async () => {
    const current = generation.current;
    setBusy(true);
    try {
      if (tab === 'export') {
        const blob = await portableApi.export(kind, [...selected], mode);
        if (generation.current !== current) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = `integral-${kind}s-${mode}.integral.zip`;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Export downloaded.', 'success'); onClose();
      } else if (file && !preview) {
        const result = await portableApi.preview(file);
        if (generation.current !== current) return;
        if (result.kind !== kind) throw new Error(`This archive contains ${result.kind === 'app' ? 'Apps' : 'Tracks'}. Import it from Manage ${result.kind === 'app' ? 'Apps' : 'Tracks'}.`);
        setPreview(result);
      } else if (file) {
        const result = await portableApi.import(file, appId);
        if (generation.current !== current) return;
        showToast(`Imported ${countLabel(result.apps || result.tracks, kind === 'app' ? 'App' : 'Track')}.`, 'success');
        onImported?.(); onClose();
      }
    } catch (error) {
      if (generation.current !== current) return;
      // Blob error responses still contain the API's actionable JSON summary.
      const blob = (error as { response?: { data?: unknown } }).response?.data;
      if (blob instanceof Blob) {
        try { showToast(message({ response: { data: JSON.parse(await blob.text()) } }), 'error'); }
        catch { showToast(message(error), 'error'); }
      } else showToast(message(error), 'error');
    } finally { if (generation.current === current) setBusy(false); }
  };

  const visible = items.filter(item => (item.name || item.title || '').toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  return <FormDialog open={open} onClose={() => { if (!busy) onClose(); }} title={`Import / export ${title}`}
    onConfirm={() => void confirm()} submitLabel={tab === 'export' ? 'Download export' : preview ? 'Import copies' : 'Preview import'}
    submitLoading={busy} submitDisabled={tab === 'export' ? !selected.size || loading : !file}>
    <div className="flex gap-2" role="tablist" aria-label="Transfer direction">
      <Button role="tab" aria-selected={tab === 'export'} variant={tab === 'export' ? 'primary' : 'ghost'} disabled={busy} icon={<Download size={16} strokeWidth={LINE_ICON_STROKE} />} onClick={() => setTab('export')}>Export</Button>
      <Button role="tab" aria-selected={tab === 'import'} variant={tab === 'import' ? 'primary' : 'ghost'} disabled={busy} icon={<Upload size={16} strokeWidth={LINE_ICON_STROKE} />} onClick={() => setTab('import')}>Import</Button>
    </div>
    {tab === 'export' ? <div className="space-y-4">
      <fieldset disabled={busy} className="space-y-2">
        <legend className="mb-2"><Text variant="body-sm" weight="medium">What to include</Text></legend>
        <Surface as="label" padding="md" tone={mode === 'configuration' ? 'panel-2' : 'panel'} hoverTone="panel-2" className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-start gap-3">
          <input className="mt-0.5 h-4 w-4 accent-[var(--brand-accent)]" type="radio" name="export-mode" checked={mode === 'configuration'} onChange={() => setMode('configuration')} />
          <span className="min-w-0"><Text variant="body-sm" weight="medium" as="span" className="block">Configuration only</Text><Text variant="body-sm" tone="muted" as="span" className="block">Structure, fields, tags and saved views. No records or files.</Text></span>
        </Surface>
        <Surface as="label" padding="md" tone={mode === 'full' ? 'panel-2' : 'panel'} hoverTone="panel-2" className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-start gap-3">
          <input className="mt-0.5 h-4 w-4 accent-[var(--brand-accent)]" type="radio" name="export-mode" checked={mode === 'full'} onChange={() => setMode('full')} />
          <span className="min-w-0"><Text variant="body-sm" weight="medium" as="span" className="block">Configuration and data</Text><Text variant="body-sm" tone="muted" as="span" className="block">Also includes records, their relationships and attached files.</Text></span>
        </Surface>
      </fieldset>
      <Text variant="body-sm" weight="medium">Choose {title} to export</Text>
      <Input aria-label={`Filter loaded ${title}`} placeholder={`Find in loaded ${title}…`} value={filter} disabled={busy} onChange={event => setFilter(event.target.value)} />
      <Surface padding="sm" tone="panel-2" className="max-h-48 space-y-1 overflow-y-auto" aria-label={`Choose ${title} to export`}>
        {visible.map(item => <Surface as="label" key={item.id} padding="sm" border="none" hoverTone="panel-2" className="flex cursor-pointer items-center gap-3">
          <input className="h-4 w-4 shrink-0 accent-[var(--brand-accent)]" type="checkbox" disabled={busy || (!selected.has(item.id) && selected.size >= 100)} checked={selected.has(item.id)} onChange={() => setSelected(previous => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} />
          <Text as="span">{item.name || item.title}</Text>
        </Surface>)}
        {!loading && !visible.length && <Text variant="body-sm" tone="muted">No {title} found.</Text>}
        {loading && <div role="status"><Text variant="body-sm" tone="muted">Loading…</Text></div>}
      </Surface>
      <div className="flex items-center justify-between gap-3"><Text variant="body-sm" tone="muted">{selected.size} selected</Text>{(cursor || failed) && <Button variant="ghost" size="sm" disabled={busy || loading} onClick={() => void more()}>{failed ? 'Retry' : 'Load more'}</Button>}</div>
      <Text variant="body-sm" tone="muted">Select related {title} together to preserve links between their records. Exports are limited to 50 MiB.</Text>
    </div> : <div className="space-y-4">
      <Text variant="body-sm" tone="muted">Choose an Integral export (.integral.zip). Imported {title} are new private copies {appId ? 'inside this App' : 'in this workspace'}.</Text>
      <input aria-label="Integral archive" type="file" accept=".zip" disabled={busy} onChange={event => { setFile(event.target.files?.[0] || null); setPreview(null); }} />
      {preview && <Surface padding="md" tone="panel-2" className="space-y-3">
        <Text>{preview.mode === 'full' ? 'Configuration and data' : 'Configuration only'}</Text>
        <ul className="max-h-40 list-inside list-disc overflow-y-auto">{preview.names.map((name, index) => <li key={index}>{name}</li>)}</ul>
        <Text variant="body-sm">{countLabel(preview.apps, 'App')} · {countLabel(preview.tracks, 'Track')} · {countLabel(preview.entries, 'record')} · {countLabel(preview.attachments, 'attachment')}</Text>
        <Text variant="body-sm" tone="muted">Existing content stays in place. Sharing permissions, credentials and activity history are not imported.</Text>
      </Surface>}
    </div>}
  </FormDialog>;
}
