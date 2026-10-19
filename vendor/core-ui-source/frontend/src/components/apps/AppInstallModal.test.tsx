/**
 * AppInstallModal — install flow tests.
 *
 * Phase 10 Plan 10-05 (APP-SETTINGS-01). Covers:
 *  - Capability prompt renders all 4 sections.
 *  - Approve → POST install → active status closes modal + calls onInstalled.
 *  - Approve → POST install → awaiting_settings transitions to settings form.
 *  - Settings form submit → POST finalize → onInstalled.
 *  - Dependency error surfaces missing-deps banner.
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
import { AppInstallModal } from './AppInstallModal';

vi.mock('../../api/client', () => ({
  default: {
    post: vi.fn(),
  },
}));

import apiClient from '../../api/client';

const mockedPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const DEFAULT_CAPS = {
  tracks: [{ key: 'source_material', name: 'Source Material' }],
  tools: ['integral_create_entry'],
  external_apis: ['https://api.example.com'],
  settings_keys: ['publish_cadence'],
};

describe('AppInstallModal', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });
  afterEach(() => cleanup());

  it('renders all 4 capability sections', () => {
    render(
      <AppInstallModal
        open
        onClose={vi.fn()}
        workspaceId="ws_1"
        libraryOperationalModelId="lib_1"
        capabilities={DEFAULT_CAPS}
        onInstalled={vi.fn()}
      />,
    );
    expect(screen.getByText('Tracks the App will create')).toBeInTheDocument();
    expect(screen.getByText('Bundle tools the App may invoke')).toBeInTheDocument();
    expect(screen.getByText('External APIs declared')).toBeInTheDocument();
    expect(screen.getByText('Settings the App requests')).toBeInTheDocument();
    expect(screen.getByText('Source Material')).toBeInTheDocument();
    expect(screen.getByText('integral_create_entry')).toBeInTheDocument();
  });

  it('approves and completes when status is active', async () => {
    const onInstalled = vi.fn();
    const onClose = vi.fn();
    mockedPost.mockResolvedValueOnce({
      data: { status: 'active', app_id: 'app_new', installed_at: 'now' },
    });
    render(
      <AppInstallModal
        open
        onClose={onClose}
        workspaceId="ws_1"
        libraryOperationalModelId="lib_1"
        capabilities={DEFAULT_CAPS}
        onInstalled={onInstalled}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('install-approve'));
    });
    await waitFor(() => expect(onInstalled).toHaveBeenCalledWith('app_new'));
    expect(onClose).toHaveBeenCalled();
    expect(mockedPost).toHaveBeenCalledWith(
      '/workspaces/ws_1/apps/install',
      { library_operational_model_id: 'lib_1', include_seed_data: true },
    );
  });

  it('acknowledges queued lifecycle work without claiming the App is installed', async () => {
    const onInstalled = vi.fn();
    mockedPost.mockResolvedValueOnce({
      data: { status: 'queued', work_item_id: 'work_install_1' },
    });
    render(
      <AppInstallModal
        open
        onClose={vi.fn()}
        workspaceId="ws_1"
        libraryOperationalModelId="lib_1"
        capabilities={DEFAULT_CAPS}
        onInstalled={onInstalled}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('install-approve'));
    });
    await waitFor(() =>
      expect(screen.getByText(/Installation has been queued/)).toBeInTheDocument(),
    );
    expect(onInstalled).not.toHaveBeenCalled();
  });

  it('transitions to settings form on awaiting_settings response', async () => {
    mockedPost.mockResolvedValueOnce({
      data: {
        status: 'awaiting_settings',
        app_id: 'app_pending',
        install_token: 'tok_xyz',
        settings_schema: {
          type: 'object',
          properties: {
            cadence: { type: 'string', title: 'Cadence' },
          },
        },
      },
    });
    render(
      <AppInstallModal
        open
        onClose={vi.fn()}
        workspaceId="ws_1"
        libraryOperationalModelId="lib_1"
        capabilities={DEFAULT_CAPS}
        onInstalled={vi.fn()}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('install-approve'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('app-settings-form')).toBeInTheDocument(),
    );
    expect(screen.getByText('Cadence')).toBeInTheDocument();
  });

  it('submits settings via finalize endpoint and completes', async () => {
    const onInstalled = vi.fn();
    const onClose = vi.fn();
    mockedPost
      .mockResolvedValueOnce({
        data: {
          status: 'awaiting_settings',
          app_id: 'app_pending',
          install_token: 'tok_xyz',
          settings_schema: {
            type: 'object',
            properties: {
              cadence: { type: 'string', title: 'Cadence' },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: { status: 'active', app_id: 'app_pending' },
      });
    render(
      <AppInstallModal
        open
        onClose={onClose}
        workspaceId="ws_1"
        libraryOperationalModelId="lib_1"
        capabilities={DEFAULT_CAPS}
        onInstalled={onInstalled}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('install-approve'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('app-settings-form')).toBeInTheDocument(),
    );
    const input = screen.getByTestId('widget-text-cadence') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'weekly' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('settings-submit'));
    });
    await waitFor(() => expect(onInstalled).toHaveBeenCalledWith('app_pending'));
    expect(mockedPost).toHaveBeenNthCalledWith(
      2,
      '/apps/app_pending/install/settings',
      { install_token: 'tok_xyz', settings: { cadence: 'weekly' } },
    );
  });

  it('acknowledges queued settings finalization without claiming the App is active', async () => {
    const onInstalled = vi.fn();
    mockedPost
      .mockResolvedValueOnce({
        data: {
          status: 'awaiting_settings',
          app_id: 'app_pending',
          install_token: 'tok_xyz',
          settings_schema: {
            type: 'object',
            properties: {
              cadence: { type: 'string', title: 'Cadence' },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: { status: 'queued', work_item_id: 'work_finalize_1' },
      });
    render(
      <AppInstallModal
        open
        onClose={vi.fn()}
        workspaceId="ws_1"
        libraryOperationalModelId="lib_1"
        capabilities={DEFAULT_CAPS}
        onInstalled={onInstalled}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('install-approve'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('app-settings-form')).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('settings-submit'));
    });
    await waitFor(() =>
      expect(
        screen.getByText(/Settings were accepted and finishing installation has been queued/),
      ).toBeInTheDocument(),
    );
    expect(onInstalled).not.toHaveBeenCalled();
  });

  it('submits schema-default settings without user interaction (June 29 QA #1)', async () => {
    // A required <select> with a schema default must submit that default even
    // if the user never touches it — the native control already displays it.
    // Regression for "Settings failed schema validation: 'publish_cadence' is
    // a required property" while the dropdown visibly showed "weekly".
    const onInstalled = vi.fn();
    mockedPost
      .mockResolvedValueOnce({
        data: {
          status: 'awaiting_settings',
          app_id: 'app_pending',
          install_token: 'tok_xyz',
          settings_schema: {
            type: 'object',
            properties: {
              publish_cadence: {
                type: 'string',
                enum: ['weekly', 'biweekly', 'monthly'],
                default: 'weekly',
                title: 'Publish cadence',
                'ui:widget': 'select',
              },
              target_platforms: {
                type: 'array',
                items: { type: 'string', enum: ['linkedin', 'instagram'] },
                default: ['instagram'],
                title: 'Target platforms',
                'ui:widget': 'multi_select',
              },
            },
            required: ['publish_cadence', 'target_platforms'],
          },
        },
      })
      .mockResolvedValueOnce({
        data: { status: 'active', app_id: 'app_pending' },
      });
    render(
      <AppInstallModal
        open
        onClose={vi.fn()}
        workspaceId="ws_1"
        libraryOperationalModelId="lib_1"
        capabilities={DEFAULT_CAPS}
        onInstalled={onInstalled}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('install-approve'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('app-settings-form')).toBeInTheDocument(),
    );
    // No field interaction — submit immediately.
    await act(async () => {
      fireEvent.click(screen.getByTestId('settings-submit'));
    });
    await waitFor(() => expect(onInstalled).toHaveBeenCalledWith('app_pending'));
    expect(mockedPost).toHaveBeenNthCalledWith(
      2,
      '/apps/app_pending/install/settings',
      {
        install_token: 'tok_xyz',
        settings: {
          publish_cadence: 'weekly',
          target_platforms: ['instagram'],
        },
      },
    );
  });

  it('renders requires_apps section when package declares cross-App dependencies (Phase 10 Plan 10-06)', () => {
    const caps = {
      ...DEFAULT_CAPS,
      requires_apps: [
        {
          key: 'hr_app',
          min_version: '1.0.0',
          optional: false,
          reason: 'employees lookup',
        },
        { key: 'notifications', min_version: '0.0.0', optional: true },
      ],
    };
    render(
      <AppInstallModal
        open
        onClose={vi.fn()}
        workspaceId="ws_1"
        libraryOperationalModelId="lib_1"
        capabilities={caps}
        onInstalled={vi.fn()}
      />,
    );
    expect(screen.getByText('Apps this App depends on')).toBeInTheDocument();
    expect(screen.getByTestId('requires-apps-list')).toBeInTheDocument();
    expect(screen.getByTestId('requires-apps-row-hr_app')).toBeInTheDocument();
    expect(screen.getByText('hr_app')).toBeInTheDocument();
    // min_version >= shown for hard dep
    expect(screen.getByText(/required.*1\.0\.0/)).toBeInTheDocument();
    // reason surfaced
    expect(screen.getByText(/employees lookup/)).toBeInTheDocument();
    // soft dep labeled optional
    expect(screen.getByText(/optional/)).toBeInTheDocument();
  });

  it('hides the requires_apps section when there are no declared deps', () => {
    render(
      <AppInstallModal
        open
        onClose={vi.fn()}
        workspaceId="ws_1"
        libraryOperationalModelId="lib_1"
        capabilities={DEFAULT_CAPS}
        onInstalled={vi.fn()}
      />,
    );
    expect(screen.queryByText('Apps this App depends on')).not.toBeInTheDocument();
  });

  it('renders example entries section and respects include_seed_data=false', async () => {
    const onInstalled = vi.fn();
    mockedPost.mockResolvedValueOnce({
      data: { status: 'active', app_id: 'app_new', installed_at: 'now' },
    });
    render(
      <AppInstallModal
        open
        onClose={vi.fn()}
        workspaceId="ws_1"
        libraryOperationalModelId="lib_1"
        capabilities={{
          ...DEFAULT_CAPS,
          seeds: [{ track: 'source_material', count: 2 }],
          seed_entry_count: 2,
        }}
        onInstalled={onInstalled}
      />,
    );
    expect(screen.getByText('Example entries the App may add')).toBeInTheDocument();
    expect(screen.getByText('source_material')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('include-seed-data-toggle-checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('install-approve'));
    });
    await waitFor(() => expect(onInstalled).toHaveBeenCalledWith('app_new'));
    expect(mockedPost).toHaveBeenCalledWith(
      '/workspaces/ws_1/apps/install',
      { library_operational_model_id: 'lib_1', include_seed_data: false },
    );
  });

  it('surfaces missing-deps banner on app_dependency_error', async () => {
    mockedPost.mockRejectedValueOnce({
      response: {
        data: {
          error_code: 'app_dependency_error',
          message: 'Missing dependencies',
          details: { missing_deps: ['parent-app'] },
        },
      },
    });
    render(
      <AppInstallModal
        open
        onClose={vi.fn()}
        workspaceId="ws_1"
        libraryOperationalModelId="lib_1"
        capabilities={DEFAULT_CAPS}
        onInstalled={vi.fn()}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('install-approve'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('missing-deps-banner')).toBeInTheDocument(),
    );
    expect(screen.getByText('parent-app')).toBeInTheDocument();
  });
});
