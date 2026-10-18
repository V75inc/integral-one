import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Mock dependencies before importing the component.
vi.mock('../../api/operationalModels', () => ({
  operationalModelsApi: { delete: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../context/ConfirmContext', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
// Modal renders children directly in tests.
vi.mock('../ui/Modal', () => {
  const Modal = ({ open, children, title }: { open: boolean; children: React.ReactNode; title: string }) =>
    open ? <div data-testid="modal"><h2>{title}</h2>{children}</div> : null;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { Modal };
});
vi.mock('../ui/Pill', () => ({
  Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

import { operationalModelsApi } from '../../api/operationalModels';
import { LibraryPackageDetailModal } from './LibraryPackageDetailModal';
import type { OperationalModelNode } from '../../types';

const baseProfile: OperationalModelNode = {
  id: 'cp-001',
  name: 'Bug Tracker',
  description: 'Track bugs and issues.',
  version: '1.0.0',
  scope: 'platform',
  manifest: {
    package: { tags: ['engineering', 'bugs'] },
    track: {
      entry_types: [
        { name: 'Bug', key: 'bug', fields: [{ key: 'title' }, { key: 'severity' }] },
      ],
      views: [
        { name: 'Kanban', key: 'kanban', type: 'kanban' },
        { name: 'Table', key: 'table', type: 'table' },
      ],
    },
  },
};

describe('LibraryPackageDetailModal', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('renders nothing when open=false', () => {
    render(
      <LibraryPackageDetailModal
        open={false}
        profile={baseProfile}
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />
    );
    expect(screen.queryByTestId('modal')).toBeNull();
  });

  it('renders package name as modal title when open=true', () => {
    render(
      <LibraryPackageDetailModal
        open={true}
        profile={baseProfile}
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />
    );
    expect(screen.getByText('Bug Tracker')).toBeTruthy();
  });

  it('shows version and scope badges', () => {
    render(
      <LibraryPackageDetailModal open={true} profile={baseProfile} onClose={vi.fn()} onDeleted={vi.fn()} />
    );
    expect(screen.getByText('v1.0.0')).toBeTruthy();
    expect(screen.getByText('Platform')).toBeTruthy();
  });

  it('lists entry types with field counts', () => {
    render(
      <LibraryPackageDetailModal open={true} profile={baseProfile} onClose={vi.fn()} onDeleted={vi.fn()} />
    );
    expect(screen.getByText('Bug')).toBeTruthy();
    expect(screen.getByText('2 fields')).toBeTruthy();
  });

  it('lists views with type labels', () => {
    render(
      <LibraryPackageDetailModal open={true} profile={baseProfile} onClose={vi.fn()} onDeleted={vi.fn()} />
    );
    expect(screen.getByText('Kanban')).toBeTruthy();
    expect(screen.getByText('kanban')).toBeTruthy();
  });

  it('calls onDeleted after successful delete', async () => {
    const onDeleted = vi.fn();
    const onClose = vi.fn();
    render(
      <LibraryPackageDetailModal open={true} profile={baseProfile} onClose={onClose} onDeleted={onDeleted} />
    );
    fireEvent.click(screen.getByText('Delete operational model'));
    await waitFor(() => {
      expect(operationalModelsApi.delete).toHaveBeenCalledWith('cp-001');
      expect(onDeleted).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
