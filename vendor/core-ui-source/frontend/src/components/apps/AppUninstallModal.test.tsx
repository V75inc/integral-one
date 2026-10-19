/**
 * AppUninstallModal — uninstall flow tests (no force; data double-confirm).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from '@testing-library/react';
import { AppUninstallModal } from './AppUninstallModal';
import type { UninstallPreflightResponse } from '../../api/apps';

const mockUninstall = vi.fn();
const mockUninstallPreflight = vi.fn();
const mockGetWorkItem = vi.fn();

vi.mock('../../api/apps', () => ({
  appsApi: {
    uninstall: (...args: unknown[]) => mockUninstall(...args),
    uninstallPreflight: (...args: unknown[]) => mockUninstallPreflight(...args),
  },
}));

vi.mock('../../api/workItems', () => ({
  workItemsApi: {
    get: (...args: unknown[]) => mockGetWorkItem(...args),
  },
}));

function clearPf(overrides: Partial<UninstallPreflightResponse> = {}): UninstallPreflightResponse {
  return {
    app_id: 'app_1',
    can_uninstall: true,
    blocking_dependents: [],
    blocking_references: [],
    entry_count: 0,
    requires_data_confirmation: false,
    ...overrides,
  };
}

describe('AppUninstallModal', () => {
  beforeEach(() => {
    mockUninstall.mockReset();
    mockUninstallPreflight.mockReset();
    mockGetWorkItem.mockReset();
    mockUninstallPreflight.mockResolvedValue(clearPf());
  });
  afterEach(() => cleanup());

  it('uninstalls successfully when no dependents', async () => {
    const onUninstalled = vi.fn();
    const onClose = vi.fn();
    mockUninstall.mockResolvedValueOnce({
      status: 'uninstalled',
      app_id: 'app_1',
    });
    render(
      <AppUninstallModal
        open
        onClose={onClose}
        appId="app_1"
        appName="Test App"
        preflight={clearPf()}
        onUninstalled={onUninstalled}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('uninstall-confirm'));
    });
    await waitFor(() => expect(onUninstalled).toHaveBeenCalledWith('app_1'));
    expect(onClose).toHaveBeenCalled();
    expect(mockUninstall).toHaveBeenCalledWith('app_1');
  });

  it('acknowledges queued lifecycle work without removing the App early', async () => {
    const onUninstalled = vi.fn();
    mockUninstall.mockResolvedValueOnce({
      status: 'queued',
      work_item_id: 'work_uninstall_1',
    });
    render(
      <AppUninstallModal
        open
        onClose={vi.fn()}
        appId="app_1"
        appName="Test App"
        preflight={clearPf()}
        onUninstalled={onUninstalled}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('uninstall-confirm'));
    });
    await waitFor(() =>
      expect(screen.getByText(/Uninstall has been queued/)).toBeInTheDocument(),
    );
    expect(onUninstalled).not.toHaveBeenCalled();
  });

  it('shows read-only blockers with no force control when preflight is blocked', async () => {
    render(
      <AppUninstallModal
        open
        onClose={vi.fn()}
        appId="app_1"
        appName="Test App"
        preflight={clearPf({
          can_uninstall: false,
          blocking_dependents: [
            {
              app_id: 'app_dependent',
              app_name: 'Dependent App',
              dep_key: 'test-app',
            },
          ],
        })}
        onUninstalled={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('blocking-deps-banner')).toBeInTheDocument(),
    );
    expect(screen.getByText('Dependent App')).toBeInTheDocument();
    expect(screen.queryByTestId('uninstall-force')).not.toBeInTheDocument();
    expect(screen.queryByTestId('uninstall-confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('uninstall-close')).toBeInTheDocument();
  });

  it('surfaces blocking_references from preflight without force', async () => {
    render(
      <AppUninstallModal
        open
        onClose={vi.fn()}
        appId="provider_app"
        appName="Provider App"
        preflight={clearPf({
          can_uninstall: false,
          blocking_references: [
            {
              source_app_id: 'consumer',
              source_app_name: 'Consumer App',
              source_entry_id: 'e1',
              source_track_id: 't1',
              relation_field_key: 'employees',
            },
            {
              source_app_id: 'consumer',
              source_app_name: 'Consumer App',
              source_entry_id: 'e2',
              source_track_id: 't1',
              relation_field_key: 'employees',
            },
            {
              source_app_id: 'downstream',
              source_app_name: 'Downstream App',
              source_entry_id: 'e3',
              source_track_id: 't2',
              relation_field_key: 'subject',
            },
          ],
        })}
        onUninstalled={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('blocking-refs-banner')).toBeInTheDocument(),
    );
    expect(screen.getByText('Consumer App')).toBeInTheDocument();
    expect(screen.getByText(/2 references/)).toBeInTheDocument();
    expect(screen.getByText('Downstream App')).toBeInTheDocument();
    expect(screen.getByText(/1 reference/)).toBeInTheDocument();
    expect(screen.queryByTestId('uninstall-force')).not.toBeInTheDocument();
  });

  it('requires typing UNINSTALL when entry_count > 0', async () => {
    const onUninstalled = vi.fn();
    mockUninstall.mockResolvedValueOnce({
      status: 'uninstalled',
      app_id: 'app_1',
    });
    render(
      <AppUninstallModal
        open
        onClose={vi.fn()}
        appId="app_1"
        appName="Data App"
        preflight={clearPf({
          entry_count: 3,
          requires_data_confirmation: true,
        })}
        onUninstalled={onUninstalled}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('uninstall-confirm'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('uninstall-data-warning')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('uninstall-data-warning')).toHaveTextContent(
      /3 entries/,
    );
    const confirmBtn = screen.getByTestId('uninstall-data-confirm');
    expect(confirmBtn).toBeDisabled();
    await act(async () => {
      fireEvent.change(screen.getByTestId('uninstall-data-token'), {
        target: { value: 'UNINSTALL' },
      });
    });
    expect(confirmBtn).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    await waitFor(() => expect(onUninstalled).toHaveBeenCalledWith('app_1'));
    expect(mockUninstall).toHaveBeenCalledWith('app_1');
  });
});
