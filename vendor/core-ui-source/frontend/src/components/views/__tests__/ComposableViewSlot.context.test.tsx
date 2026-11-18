import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../../hooks/useTrackViews', () => ({ useTrackViews: () => ({data: [{id: 'view', type: 'extension_view', name: 'Review'}], isPending: false, isError: false}) }));
vi.mock('../../../views/savedViewEntryList', () => ({ savedViewUsesHostedEntryList: () => false }));
vi.mock('../registry', () => ({
  getWidget: () => ({scope: 'track'}),
  ViewRenderer: ({viewContext, view}: {viewContext?: string; view: {config?: {__bindings?: {entryId?: string}}}}) =>
    <div data-testid="child" data-view-context={viewContext} data-entry={view.config?.__bindings?.entryId} />,
}));
import { ComposableViewSlot } from '../ComposableViewSlot';

it('forwards track context and explicit record bindings to the nested renderer', () => {
  render(<QueryClientProvider client={new QueryClient()}><ComposableViewSlot trackId="track" viewKey="Review" viewContext="track-list" bindings={{entryId: 'bound'}} /></QueryClientProvider>);
  expect(screen.getByTestId('child')).toHaveAttribute('data-view-context', 'track-list');
  expect(screen.getByTestId('child')).toHaveAttribute('data-entry', 'bound');
});
