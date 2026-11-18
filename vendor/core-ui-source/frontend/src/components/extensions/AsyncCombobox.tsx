/** A bounded, remotely searched picker. The App supplies its governed read. */
import {useEffect, useId, useRef, useState} from 'react';
import {useOptionalAppUI} from '@integral/sdk-react';
import type {AsyncComboboxProps, LookupPage} from '@integral/sdk-react';
import {AppSelect} from '../ui/AppSelect';
import {Button} from '../ui/Button';
import {Text} from '../../ui';

export function AsyncCombobox({id, required, 'aria-describedby': ariaDescribedBy, label, value, selectedLabel, loadPage, onChange, disabled, placeholder, invalid, onCreate, createLabel}: AsyncComboboxProps) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const focusInput = () => document.getElementById(controlId)?.focus();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState({query: '', cursors: [null] as (string | null)[], index: 0});
  const [revision, retry] = useState(0);
  const [page, setPage] = useState<LookupPage>({items: []});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const ui = useOptionalAppUI();
  useEffect(() => open && !disabled ? ui?.subscribe?.(() => retry(value => value + 1)) : undefined, [open, disabled, ui?.subscribe]);
  useEffect(() => {
    if (!open || query.trim() === selection.query) return;
    const timer = setTimeout(() => setSelection({query: query.trim(), cursors: [null], index: 0}), query.trim() ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, open, selection.query]);
  useEffect(() => {
    if (!open || disabled || query.trim() !== selection.query) return;
    const generation = ++sequence.current;
    const controller = new AbortController();
    setLoading(true); setError(''); setPage(previous => ({...previous, items: []}));
    loadPage(selection.query, selection.cursors[selection.index], controller.signal).then(result => {
      if (!controller.signal.aborted && generation === sequence.current) setPage({...result, items: result.items.slice(0, 50)});
    }, cause => {
      if (!controller.signal.aborted && generation === sequence.current) setError(cause instanceof Error ? cause.message : 'Could not load options.');
    }).finally(() => {if (!controller.signal.aborted && generation === sequence.current) setLoading(false);});
    return () => {controller.abort(); sequence.current++;};
  }, [open, disabled, loadPage, selection, revision, query]);
  const busy = loading || query.trim() !== selection.query;
  const items = busy ? [] : page.items;
  return <AppSelect id={controlId} required={required} aria-invalid={invalid} aria-describedby={ariaDescribedBy} value={value} selectedLabel={selectedLabel} options={items.map(item => ({value: item.id, label: item.label, description: item.description, disabled: item.disabled}))}
    onValueChange={id => {const item = items.find(item => item.id === id); if (item) onChange(item);}}
    open={open} onOpenChange={next => {if (next && !open) {setQuery(''); setSelection({query: '', cursors: [null], index: 0});} setOpen(next);}} searchable remoteSearch onSearchChange={setQuery}
    aria-label={label} disabled={disabled} placeholder={placeholder || 'Search…'} className={invalid ? 'app-input border-[var(--danger)]' : 'app-input'}
    footer={<div className="border-t border-[var(--panel-border)] p-2 space-y-2">
      {busy ? <div role="status"><Text as="p" variant="body-sm">Loading options…</Text></div> : error ? <div role="alert"><Text as="p" variant="body-sm" tone="danger">{error}</Text></div> : !items.length ? <Text as="p" variant="body-sm">No matching records.</Text> : null}
      <div className="flex items-center gap-2">
        {error ? <Button type="button" size="sm" variant="ghost" onClick={() => {retry(n => n + 1); focusInput();}}>Retry</Button> : null}
        {selection.index > 0 ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => {setSelection(previous => ({...previous, index: previous.index - 1})); focusInput();}}>Previous</Button> : null}
        {page.next_cursor ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => {setSelection(previous => ({...previous, cursors: [...previous.cursors.slice(0, previous.index + 1), page.next_cursor!], index: previous.index + 1})); focusInput();}}>Next</Button> : null}
        {onCreate ? <Button type="button" size="sm" variant="ghost" onClick={() => {focusInput(); setOpen(false); onCreate();}}>{createLabel || 'Add record'}</Button> : null}
      </div>
    </div>} />;
}
