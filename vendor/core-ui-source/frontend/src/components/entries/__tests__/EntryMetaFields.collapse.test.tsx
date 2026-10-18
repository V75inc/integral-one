import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EntryMetaFields } from '../EntryMetaFields';
import { ToastProvider } from '../../../context/ToastContext';
import type { OperationalModelFieldSpec } from '../../../types';

vi.mock('../../../context/ScopeContext', () => ({
  useScope: () => ({ scope: { workspaceId: 'ws' } }),
}));
afterEach(cleanup);

function renderFields(
  fields: OperationalModelFieldSpec[],
  values: Record<string, unknown>,
  onCommitField?: (key: string, value: unknown) => Promise<void>,
  entryId?: string
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <StrictMode>
        <EntryMetaFields
          fields={fields}
          values={values}
          variant="detail"
          onCommitField={onCommitField}
          entryId={entryId}
        />
        </StrictMode>
      </ToastProvider>
    </QueryClientProvider>
  );
}

it('clamps a long max_lines value and expands it with Read more', () => {
  const lines = Array.from({ length: 12 }, (_, i) => `[t] User: line ${i}`).join('\n');
  const fields = [
    { key: 'history', name: 'History', type: 'text', max_lines: 6 },
  ] as OperationalModelFieldSpec[];
  renderFields(fields, { history: lines });

  const value = screen.getByText(/line 0/);
  expect(value.parentElement?.getAttribute('style') || '').toContain(
    '-webkit-line-clamp: 6'
  );

  fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
  expect(value.parentElement?.getAttribute('style') || '').not.toContain(
    '-webkit-line-clamp'
  );
  expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
});

it('shows no Read more for a short value', () => {
  const fields = [
    { key: 'history', name: 'History', type: 'text', max_lines: 6 },
  ] as OperationalModelFieldSpec[];
  renderFields(fields, { history: '[t] User: hi' });
  expect(screen.queryByRole('button', { name: 'Read more' })).toBeNull();
});

it('spans a full_width field across the grid', () => {
  const fields = [
    { key: 'summary', name: 'Summary', type: 'text', full_width: true },
  ] as OperationalModelFieldSpec[];
  renderFields(fields, { summary: 'a summary line' });

  const label = screen.getByText('Summary');
  expect(label.parentElement?.className).toContain('sm:col-span-2');
});

it('omits an empty hide_when_empty field on the detail', () => {
  const fields = [
    { key: 'owner', name: 'Owner', type: 'member', hide_when_empty: true },
    { key: 'phone', name: 'Phone', type: 'text' },
  ] as OperationalModelFieldSpec[];
  renderFields(fields, { phone: '555' });

  expect(screen.queryByText('Owner')).toBeNull();
  expect(screen.getByText('Phone')).toBeVisible();
});

it('keeps an empty media row on the detail (media stays attachable)', () => {
  const fields = [
    { key: 'media', name: 'Media', type: 'files' },
    { key: 'phone', name: 'Phone', type: 'text' },
  ] as OperationalModelFieldSpec[];
  renderFields(fields, { phone: '555' });

  expect(screen.getByText('Media')).toBeVisible();
  expect(screen.getByText('—')).toBeVisible();

  cleanup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EntryMetaFields
        fields={fields}
        values={{ phone: '555' }}
        variant="card"
      />
    </QueryClientProvider>
  );
  expect(screen.queryByText('Media')).toBeNull();
});

it('renders an editable select in the detail and commits the choice', async () => {
  const onCommit = vi.fn().mockResolvedValue(undefined);
  const fields = [
    {
      key: 'pipeline_status',
      name: 'Pipeline status',
      type: 'select',
      enum: ['new', 'contacted'],
    },
  ] as OperationalModelFieldSpec[];
  renderFields(fields, { pipeline_status: 'new' }, onCommit);

  const combo = screen.getByRole('combobox', { name: /Pipeline status/ });
  fireEvent.focus(combo);
  fireEvent.click(screen.getByRole('option', { name: 'Contacted' }));
  await waitFor(() =>
    expect(onCommit).toHaveBeenCalledWith('pipeline_status', 'contacted')
  );
});

it('filters the inline select via its search box and commits', async () => {
  const onCommit = vi.fn().mockResolvedValue(undefined);
  const fields = [
    {
      key: 'pipeline_status',
      name: 'Pipeline status',
      type: 'select',
      enum: ['new', 'contacted'],
    },
  ] as OperationalModelFieldSpec[];
  renderFields(fields, { pipeline_status: 'new' }, onCommit);

  const combo = screen.getByRole('combobox', { name: /Pipeline status/ });
  fireEvent.focus(combo);
  fireEvent.change(combo, { target: { value: 'cont' } });

  expect(screen.queryByRole('option', { name: 'New' })).toBeNull();
  fireEvent.click(screen.getByRole('option', { name: 'Contacted' }));
  await waitFor(() =>
    expect(onCommit).toHaveBeenCalledWith('pipeline_status', 'contacted')
  );
});

it('renders a select as plain text for a read-only viewer', () => {
  const fields = [
    {
      key: 'pipeline_status',
      name: 'Pipeline status',
      type: 'select',
      enum: ['new', 'contacted'],
    },
  ] as OperationalModelFieldSpec[];
  renderFields(fields, { pipeline_status: 'new' });

  expect(screen.queryByRole('button', { name: /Pipeline status/ })).toBeNull();
  expect(screen.getByText('New')).toBeVisible();
});

it('lays grouped card fields out as contact | request columns', () => {
  const fields = [
    { key: 'organization', name: 'Organization', type: 'text', group: 'Contact' },
    { key: 'email', name: 'Email', type: 'text', group: 'Contact' },
    { key: 'interested_products', name: 'Interested in', type: 'text', group: 'Request' },
    { key: 'requested_items', name: 'Requested items', type: 'text', group: 'Request' },
    { key: 'pipeline_status', name: 'Pipeline status', type: 'text', group: 'Pipeline' },
  ] as OperationalModelFieldSpec[];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EntryMetaFields
        fields={fields}
        values={{
          organization: 'M&B',
          email: 'a@b.com',
          interested_products: 'geotextiles',
          requested_items: '2 rolls',
          pipeline_status: 'New',
        }}
        variant="card"
      />
    </QueryClientProvider>
  );

  const cols = document.querySelectorAll('[data-card-column]');
  expect(cols).toHaveLength(2);
  expect(cols[0].textContent).toContain('Organization');
  expect(cols[0].textContent).toContain('Email');
  expect(cols[0].textContent).not.toContain('Interested in');
  expect(cols[1].textContent).toContain('Interested in');
  expect(cols[1].textContent).toContain('Requested items');

  const trailing = document.querySelector('[data-card-trailing]');
  expect(trailing?.textContent).toContain('Pipeline status');
});

it('keeps grid layout for cards without field groups', () => {
  const fields = [
    { key: 'organization', name: 'Organization', type: 'text' },
    { key: 'email', name: 'Email', type: 'text' },
  ] as OperationalModelFieldSpec[];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EntryMetaFields
        fields={fields}
        values={{ organization: 'M&B', email: 'a@b.com' }}
        variant="card"
      />
    </QueryClientProvider>
  );
  expect(document.querySelectorAll('[data-card-column]')).toHaveLength(0);
});

it('keeps empty editable fields but hides empty informational ones (hide_when_empty)', () => {
  const fields = [
    {
      key: 'pipeline_status',
      name: 'Pipeline status',
      type: 'select',
      enum: ['new', 'contacted'],
      hide_when_empty: true,
    },
    {
      key: 'last_contacted_at',
      name: 'Last contacted',
      type: 'datetime',
      hide_when_empty: true,
    },
    {
      key: 'internal_notes',
      name: 'Internal notes',
      type: 'text',
      readonly: true,
      hide_when_empty: true,
    },
  ] as OperationalModelFieldSpec[];
  renderFields(fields, {}, async () => {});
  expect(screen.getByText('Pipeline status')).toBeVisible();
  // Dates are inline-editable, so an empty one still renders so it can be set
  // from the card; a protected/informational field stays hidden while empty.
  expect(screen.getByText('Last contacted')).toBeVisible();
  expect(screen.queryByText('Internal notes')).toBeNull();
});

it('makes a markdown field editable as a textarea in the detail', async () => {
  const onCommit = vi.fn().mockResolvedValue(undefined);
  const fields = [
    { key: 'description', name: 'Description', type: 'markdown' },
  ] as OperationalModelFieldSpec[];
  renderFields(fields, { description: 'hello' }, onCommit);

  fireEvent.click(screen.getByRole('button', { name: 'Edit Description' }));
  const box = screen.getByRole('textbox');
  expect(box.tagName).toBe('TEXTAREA');
  fireEvent.change(box, { target: { value: 'updated' } });
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.blur(box);
  await waitFor(() =>
    expect(onCommit).toHaveBeenCalledWith('description', 'updated')
  );
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  expect(screen.getByRole('button', { name: 'Edit Description' })).not.toBeDisabled();
});

it('renders markdown read-only when the viewer cannot edit', () => {
  const fields = [
    { key: 'description', name: 'Description', type: 'markdown' },
  ] as OperationalModelFieldSpec[];
  renderFields(fields, { description: 'hello' });
  expect(screen.queryByRole('textbox')).toBeNull();
});

it('shows the media field label only once (file control hides its own label)', () => {
  const fields = [
    {
      key: 'media',
      name: 'Media',
      type: 'files',
      config: { accept: ['image/*'], max_count: 10 },
    },
  ] as OperationalModelFieldSpec[];
  renderFields(fields, { media: ['att1'] }, async () => {}, 'n.Entry.1');
  expect(screen.getAllByText('Media')).toHaveLength(1);
});

it('shows group headers on the detail but not on cards', () => {
  const fields = [
    { key: 'organization', name: 'Organization', type: 'text', group: 'Contact' },
  ] as OperationalModelFieldSpec[];

  renderFields(fields, { organization: 'M&B' });
  expect(screen.getByText('Contact')).toBeTruthy();
  cleanup();

  render(
    <QueryClientProvider client={new QueryClient()}>
      <EntryMetaFields
        fields={fields}
        values={{ organization: 'M&B' }}
        variant="card"
      />
    </QueryClientProvider>
  );
  expect(screen.queryByText('Contact')).toBeNull();
});


it.each(['viewer', 'protected', 'field'])('keeps %s file fields read-only despite a commit callback', mode => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <EntryMetaFields
          fields={[{ key: 'media', name: 'Media', type: 'files', readonly: mode === 'field' }]}
          values={{ media: [] }}
          variant="detail"
          entryId="n.Entry.readonly"
          readOnly={mode === 'viewer'}
          readOnlyKeys={mode === 'protected' ? ['media'] : []}
          onCommitField={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
  expect(screen.queryByText('Attach file')).toBeNull();
  expect(document.querySelector('input[type="file"]')).toBeNull();
});


it('keeps card group positions stable when the first group is empty', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EntryMetaFields
        fields={[
          { key: 'context', name: 'Context', type: 'text', group: 'First' },
          { key: 'summary', name: 'Summary', type: 'text', group: 'Second' },
          { key: 'state', name: 'State', type: 'text', group: 'Third' },
        ]}
        values={{ summary: 'Visible summary', state: 'Ready' }}
        variant="card"
      />
    </QueryClientProvider>
  );
  const columns = document.querySelectorAll('[data-card-column]');
  expect(columns).toHaveLength(2);
  expect(columns[0].textContent).not.toContain('Visible summary');
  expect(columns[1].textContent).toContain('Visible summary');
  expect(document.querySelector('[data-card-trailing]')?.textContent).toContain('Ready');
});
