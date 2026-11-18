import {act, renderHook, waitFor} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {AppUIProvider, useAppQuery, useEntryDraft, type AppUI} from '@integral/sdk-react';
import {supportsSDKRange} from './AppReactComponentHost';
it('supports SDK 1.0, 1.1 and 1.2 while rejecting newer required contracts', () => {
  expect(supportsSDKRange('^1.0.0')).toBe(true); expect(supportsSDKRange('^1.1.0')).toBe(true); expect(supportsSDKRange('^1.2.0')).toBe(true);
  expect(supportsSDKRange('^1.3.0')).toBe(false); expect(supportsSDKRange('^2.0.0')).toBe(false);
});
it('uses host draft metadata and does not dispatch or subscribe while disabled', async () => {
  const query = vi.fn(async () => ({items: []})); const subscribe = vi.fn(() => () => {}); const patch = vi.fn();
  const api = {principalId: 'user', workspaceId: 'ws', appId: 'app', componentKey: 'editor', query, subscribe, lifecycle: {mode: 'create', customFields: {email: 'draft'}, fields: [{key: 'email', name: 'Email', type: 'text'}], fieldErrors: {email: 'Invalid'}, onDraftPatch: patch}} as unknown as AppUI;
  const test = renderHook(({enabled}) => ({draft: useEntryDraft(), query: useAppQuery('options', {}, {enabled})}), {initialProps: {enabled: false}, wrapper: ({children}) => <AppUIProvider value={api}>{children}</AppUIProvider>});
  expect(query).not.toHaveBeenCalled(); expect(subscribe).not.toHaveBeenCalled(); expect(test.result.current.query.loading).toBe(false);
  expect(test.result.current.draft.fields[0].name).toBe('Email'); expect(test.result.current.draft.errors.email).toBe('Invalid');
  act(() => test.result.current.draft.patch({email: 'new'})); expect(patch).toHaveBeenCalledWith({custom_fields: {email: 'new'}});
  test.rerender({enabled: true});
  await waitFor(() => expect(test.result.current.query.loading).toBe(false)); expect(query).toHaveBeenCalledTimes(1);
  test.rerender({enabled: false});
  expect(subscribe).toHaveBeenCalledTimes(1);
});
it('keeps the data on screen while the same query refreshes', async () => {
  let n = 0; const query = vi.fn(async () => ({n: ++n}));
  const api = {principalId: 'user', workspaceId: 'ws', appId: 'app', componentKey: 'review', query, lifecycle: {mode: 'detail', customFields: {}, fields: [], fieldErrors: {}}} as unknown as AppUI;
  const test = renderHook(() => useAppQuery('review', {entry_id: 'e1'}), {wrapper: ({children}) => <AppUIProvider value={api}>{children}</AppUIProvider>});
  await waitFor(() => expect(test.result.current.data).toEqual({n: 1}));
  act(() => test.result.current.refetch());
  expect(test.result.current.data).toEqual({n: 1});
  await waitFor(() => expect(test.result.current.data).toEqual({n: 2}));
});
