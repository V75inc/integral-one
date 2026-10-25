import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { extensionsApi, isRecordedOutputWithheld } from '../../api/extensions';
import { useScope } from '../../context/ScopeContext';
import { useToast } from '../../context/ToastContext';
import { Button, MarkdownContent, Skeleton, ViewTabs } from '../../components/ui';
import { Input, Surface, Text, Textarea } from '../../ui';
import { DashboardWidgetRenderer } from './DashboardWidgetRegistry';
import type { HomeElement } from './nativeHomeTypes';

type Props = { appId: string; workspaceId: string; node: HomeElement; preview: boolean; liveData: boolean; refreshVersion?: number; onChanged: () => void };
function valueAt(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, key) ? (current as Record<string, unknown>)[key] : undefined, value);
}
const GAP = { sm: 'gap-3', md: 'gap-5', lg: 'gap-8' };
const COLUMNS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-1 md:grid-cols-2', 3: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3', 4: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4' };

/** Native React composition. Package content never becomes executable DOM/code. */
export function NativeHome(props: Props) {
  const { node, appId, workspaceId, preview, liveData } = props;
  const { scope } = useScope();
  const navigate = useNavigate();
  const mount = useRef('');
  const identity = `${appId}:${workspaceId}:${scope?.workspaceId}`;
  useLayoutEffect(() => { mount.current = identity; return () => { mount.current = ''; }; }, [identity]);
  const { showToast } = useToast();
  const [tab, setTab] = useState(node.children?.[0]?.id || '');
  const query = useQuery({
    queryKey: ['app-home-query', appId, workspaceId, node.query_key, node.params || {}],
    queryFn: () => extensionsApi.invokeQuery(appId, node.query_key!, node.params || {}),
    enabled: Boolean(node.query_key && liveData && scope?.workspaceId === workspaceId),
    refetchInterval: 15_000, retry: false,
  });
  const child = (item: HomeElement) => <NativeHome key={item.id} {...props} node={item} />;
  const children = (node.children || []).map(child);
  if (node.type === 'stack') return <div className={`flex min-w-0 flex-col ${GAP[node.gap || 'md']}`}>{children}</div>;
  if (node.type === 'grid') return <div className={`grid min-w-0 ${COLUMNS[node.columns || 2]} ${GAP[node.gap || 'md']}`}>{children}</div>;
  if (node.type === 'card') return <Surface tone="panel" className={`flex min-w-0 flex-col p-5 ${GAP[node.gap || 'md']}`}>{node.title ? <Text as="h3" variant="heading-sm">{node.title}</Text> : null}{children}</Surface>;
  if (node.type === 'heading') return <Text as="h3" variant="heading-md">{node.text || node.title}</Text>;
  if (node.type === 'text') return <Text as="p" tone="muted">{node.text || node.title}</Text>;
  if (node.type === 'markdown') return <MarkdownContent>{node.text || node.title || ''}</MarkdownContent>;
  if (node.type === 'tabs') {
    const active = node.children?.find(item => item.id === tab) || node.children?.[0];
    return <div className="min-w-0 space-y-5"><ViewTabs ariaLabel={node.title || 'Home sections'} options={(node.children || []).map(item => ({ value: item.id, label: item.title || item.id }))} value={active?.id || ''} onChange={setTab} />{(node.children || []).map(item => <div key={item.id} hidden={active?.id !== item.id}>{child(item)}</div>)}</div>;
  }
  if (node.type === 'accordion') return <div className="space-y-3">{(node.children || []).map(item => <details key={item.id} className="rounded-[var(--radius-card)] border border-[var(--border)] p-4"><summary className="cursor-pointer"><Text variant="heading-sm">{item.title || item.id}</Text></summary><div className="pt-4">{child(item)}</div></details>)}</div>;
  if (node.type === 'form' || node.type === 'action') return <NativeHomeAction key={`${appId}:${workspaceId}:${node.id}:${node.operation_key}:${JSON.stringify(node.payload || {})}`} {...props} />;
  if (!liveData) return <Surface tone="panel" className="space-y-2 p-5"><Text as="h3" variant="heading-sm">{node.title}</Text><Text as="p" tone="muted">Enable live data to preview this component.</Text></Surface>;
  if (query.isPending) return <Skeleton className="h-32" />;
  if (query.isError) return <Surface tone="panel" className="space-y-3 p-5"><Text as="p" tone="muted">This information is unavailable.</Text><Button variant="secondary" onClick={() => void query.refetch()}>Try again</Button></Surface>;
  const output = query.data?.output;
  const raw = valueAt(output, node.rows_path || 'items');
  const rows = Array.isArray(raw) ? raw.filter(item => item && typeof item === 'object') as Record<string, unknown>[] : [];
  if (node.type === 'metric') return <DashboardWidgetRenderer type="metric_card" title={node.title || ''} data={{ value: valueAt(output, node.value_path || 'total_estimate') }} />;
  if (node.type === 'chart') return <div className="min-h-64 min-w-0"><DashboardWidgetRenderer type={`chart_${node.chart_type || 'bar'}`} title={node.title || ''} data={{ series: rows.map(row => ({ label: String(valueAt(row, node.label_field || 'title') ?? 'Untitled'), value: node.value_field ? valueAt(row, node.value_field) : 1 })) }} /></div>;
  return <Surface tone="panel" className="space-y-4 p-5"><Text as="h3" variant="heading-sm">{node.title || 'Records'}</Text>{rows.length ? <ul className="divide-y divide-[var(--border)]">{rows.map((row, index) => <li key={String(row.id || index)} className="py-2"><Button variant="ghost" disabled={preview || !row.id} onClick={async () => {
    try { const target = await extensionsApi.resolveNavigation(appId, { kind: 'entry', id: String(row.id) }); if (mount.current === identity) navigate(target.path); } catch { showToast('This record is unavailable.', 'error'); }
  }}>{String(valueAt(row, node.label_field || 'title') ?? 'Untitled')}</Button></li>)}</ul> : <Text as="p" tone="muted">No records yet.</Text>}</Surface>;
}

function NativeHomeAction({ appId, workspaceId, node, preview, onChanged }: Props) {
  const { showToast } = useToast();
  const { scope } = useScope();
  const client = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(
    (node.fields || []).filter(item => node.payload?.[item.name] !== undefined || item.type === 'checkbox')
      .map(item => [item.name, node.payload?.[item.name] ?? false]),
  ));
  const [busy, setBusy] = useState(false);
  const intent = useRef<string | null>(null);
  const binding = `${appId}:${workspaceId}:${node.operation_key}`;
  const active = useRef(binding);
  useEffect(() => { active.current = binding; intent.current = null; return () => { active.current = ''; }; }, [binding]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (preview || busy || scope?.workspaceId !== workspaceId) return;
    const original = binding;
    intent.current ||= crypto.randomUUID();
    setBusy(true);
    try {
      const result = await extensionsApi.invokeOperation(appId, node.operation_key!, { ...(node.payload || {}), ...values }, intent.current);
      if (active.current !== original) return;
      if (isRecordedOutputWithheld(result)) { showToast('The action completed, but its result is no longer available.', 'info'); return; }
      intent.current = null;
      showToast(typeof result.output?.message === 'string' ? result.output.message : 'Completed.', 'success');
      onChanged(); void client.invalidateQueries({ queryKey: ['app-home-query', appId, workspaceId] });
    } catch (error) {
      if (active.current !== original) return;
      const unconfirmed = isAxiosError(error) && (!error.response || error.response.status >= 500 || error.response.status === 408);
      if (!unconfirmed) intent.current = null;
      const message = isAxiosError(error) && typeof error.response?.data?.message === 'string' ? error.response.data.message : 'This action could not be completed.';
      showToast(unconfirmed ? 'Result unconfirmed. Check current state before retrying.' : message, 'error');
    } finally { if (active.current === original) setBusy(false); }
  };
  const field = (name: string, value: unknown) => { intent.current = null; setValues(previous => ({ ...previous, [name]: value })); };
  return <form onSubmit={submit} className="min-w-0 space-y-4" aria-label={node.title || node.submit_label || 'App action'}>
    {node.title ? <Text as="h3" variant="heading-sm">{node.title}</Text> : null}
    {(node.fields || []).map(item => <label key={item.name} className="block space-y-2"><Text as="span" variant="body-sm">{item.label}</Text>{item.type === 'textarea' ? <Textarea required={item.required} disabled={busy || preview} value={String(values[item.name] ?? '')} onChange={event => field(item.name, event.target.value)} /> : <Input type={item.type || 'text'} required={item.required} disabled={busy || preview} checked={item.type === 'checkbox' ? Boolean(values[item.name]) : undefined} value={item.type === 'checkbox' ? undefined : String(values[item.name] ?? '')} onChange={event => field(item.name, item.type === 'checkbox' ? event.target.checked : item.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} />}</label>)}
    <Button type="submit" disabled={preview || busy || scope?.workspaceId !== workspaceId}>{busy ? 'Running…' : node.submit_label || 'Submit'}</Button>
  </form>;
}
