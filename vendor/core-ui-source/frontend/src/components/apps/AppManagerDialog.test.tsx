/**
 * AppManagerDialog — install-only Apply; per-row Uninstall.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerInstallDenialResolver } from '../../host/registry';
import type { ComponentProps } from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppManagerDialog } from './AppManagerDialog';
import type { App, OperationalModelNode } from '../../types';

const mockListProfiles = vi.fn();
const mockDeleteProfile = vi.fn();
const mockBatchInstall = vi.fn();
const mockUninstall = vi.fn();
const mockUninstallPreflight = vi.fn();
const mockGetWorkItem = vi.fn();

vi.mock('../../api/operationalModels', () => ({
  operationalModelsApi: {
    list: (...args: unknown[]) => mockListProfiles(...args),
    delete: (...args: unknown[]) => mockDeleteProfile(...args),
  },
}));

vi.mock('../../context/ConfirmContext', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../api/apps', () => ({
  appsApi: {
    batchInstall: (...args: unknown[]) => mockBatchInstall(...args),
    uninstall: (...args: unknown[]) => mockUninstall(...args),
    uninstallPreflight: (...args: unknown[]) => mockUninstallPreflight(...args),
    finalizeInstall: vi.fn(),
    getAppSettings: vi.fn(),
  },
}));

vi.mock('../../api/workItems', () => ({
  workItemsApi: {
    get: (...args: unknown[]) => mockGetWorkItem(...args),
  },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', user_id: 'user-1' },
  }),
}));

vi.mock('../../context/ScopeContext', () => ({
  useScope: () => ({ scope: { workspaceId: 'ws_1' } }),
}));

const INSTALLED_APP: App = {
  id: 'app-installed',
  name: 'Content Factory',
  owner_user_id: 'user-1',
  installed_from_library_id: 'lib-cf',
  source_operational_model_slug: 'content-factory',
  lifecycle_state: 'active',
};

const LIB_INSTALLED: OperationalModelNode = {
  id: 'lib-cf',
  name: 'Content Factory',
  library_package: true,
  manifest: {
    scope: 'app',
    package: { name: 'Content Factory', slug: 'content-factory', description: 'Installed pkg' },
    app: { tracks: [] },
  },
};

const LIB_AVAILABLE: OperationalModelNode = {
  id: 'lib-hr',
  name: 'HR Suite',
  library_package: true,
  workspace_id: 'ws_1',
  manifest: {
    scope: 'app',
    package: { name: 'HR Suite', slug: 'hr-suite', description: 'HR bundle' },
    app: { tracks: [{ key: 'employees', name: 'Employees' }] },
  },
};

const LIB_OTHER_WORKSPACE: OperationalModelNode = {
  id: 'lib-other',
  name: 'Other Workspace Template',
  library_package: true,
  workspace_id: 'ws_other',
  manifest: {
    scope: 'app',
    package: {
      name: 'Other Workspace Template',
      slug: 'other-ws-template',
      description: 'Private to another workspace',
    },
    app: { tracks: [] },
  },
};

function renderDialog(
  props: Partial<ComponentProps<typeof AppManagerDialog>> = {},
) {
  return render(
    <MemoryRouter>
      <AppManagerDialog
        isOpen
        onClose={vi.fn()}
        apps={[INSTALLED_APP]}
        onChanged={vi.fn()}
        onCreateBlankApp={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

async function showInstalled() {
  fireEvent.click(screen.getByRole('tab', { name: /Installed/ }));
}

async function confirmInstall() {
  fireEvent.click(screen.getByTestId('app-manager-review'));
  fireEvent.click(await screen.findByTestId('app-manager-apply'));
}

describe('AppManagerDialog', () => {
  beforeEach(() => {
    mockListProfiles.mockReset();
    mockDeleteProfile.mockReset();
    mockDeleteProfile.mockResolvedValue(undefined);
    mockBatchInstall.mockReset();
    mockUninstall.mockReset();
    mockUninstallPreflight.mockReset();
    mockGetWorkItem.mockReset();
    mockUninstallPreflight.mockResolvedValue({
      app_id: 'app-installed',
      can_uninstall: true,
      blocking_dependents: [],
      blocking_references: [],
      entry_count: 0,
      requires_data_confirmation: false,
    });
    mockGetWorkItem.mockResolvedValue({
      work_item_id: 'work_1',
      kind: 'app_lifecycle',
      status: 'running',
      workspace_id: 'ws_1',
      app_id: 'app-installed',
      attempt: 1,
      next_attempt_at: '',
      updated_at: '',
      result_refs: [],
    });
    mockListProfiles.mockResolvedValue([
      LIB_INSTALLED,
      LIB_AVAILABLE,
      LIB_OTHER_WORKSPACE,
    ]);
  });
  afterEach(() => {
    cleanup();
    registerInstallDenialResolver(null);
  });

  it('hides private templates belonging to another workspace', async () => {
    renderDialog();
    expect(
      await screen.findByTestId('app-manager-row-hr-suite'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('app-manager-row-other-ws-template'),
    ).not.toBeInTheDocument();
  });

  it('separates installed Apps and the searchable library', async () => {
    renderDialog();
    expect(await screen.findByTestId('app-manager-available')).toBeInTheDocument();
    expect(screen.queryByTestId('app-manager-installed')).not.toBeInTheDocument();
    await showInstalled();
    expect(await screen.findByTestId('app-manager-installed')).toHaveTextContent('Content Factory');
    expect(screen.queryByTestId('app-manager-available')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Browse library/ }));
    expect(await screen.findByTestId('app-manager-row-hr-suite')).toBeInTheDocument();
  });

  it('shows full package details without losing the installation selection', async () => {
    mockListProfiles.mockResolvedValueOnce([{ ...LIB_AVAILABLE, description: 'Short overview', version: '2.4.0', manifest: {
      scope: 'app', package: { description: 'Full description with all the details.' },
      app: { tracks: [{ key: 'employees', name: 'Employees', description: 'Keep employee records together.',
        entry_types: [{ key: 'person', name: 'Person', fields: [{ key: 'email', name: 'Email address', type: 'email' }] }],
        taxonomy: { tag_groups: [{ name: 'Status', tags: [{ name: 'Active' }] }] },
        views: [{ name: 'Directory', view_type: 'table', is_default: true }],
      }] },
    } }]);
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: 'Add HR Suite' }));
    fireEvent.click(screen.getByRole('button', { name: 'View details for HR Suite' }));
    expect(screen.getByText('Full description with all the details.')).toBeInTheDocument();
    expect(screen.getByText('Keep employee records together.')).toBeInTheDocument();
    expect(screen.getByText(/Version 2.4.0/)).toBeInTheDocument();
    expect(screen.getByText(/Directory.*table.*default/)).toBeInTheDocument();
    expect(screen.getByText('Status: Active')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Person · 1 field'));
    expect(screen.getByText('Email address · email · email')).toBeInTheDocument();
    expect(mockBatchInstall).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(screen.getByRole('button', { name: 'Remove HR Suite' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens a bookmarked package in the canonical manager detail view', async () => {
    renderDialog({ initialDetailId: 'lib-hr' });
    expect(await screen.findByTestId('app-package-details')).toHaveTextContent('HR bundle');
    fireEvent.click(screen.getByRole('button', { name: 'Add to selection' }));
    expect(screen.getByRole('button', { name: 'Remove from selection' })).toBeInTheDocument();
    expect(mockBatchInstall).not.toHaveBeenCalled();
  });

  it('lets users delete a workspace saved template from Manage Apps', async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: 'View details for HR Suite' }));
    const remove = await screen.findByRole('button', {
      name: 'Delete HR Suite template',
    });
    fireEvent.click(remove);
    await waitFor(() => expect(mockDeleteProfile).toHaveBeenCalledWith('lib-hr'));
    await waitFor(() =>
      expect(screen.queryByTestId('app-manager-row-hr-suite')).not.toBeInTheDocument(),
    );
  });

  it('marks already-installed packages and disables their row', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByTestId('app-manager-row-content-factory')).toBeInTheDocument(),
    );
    const installedRow = screen.getByTestId('app-manager-row-content-factory');
    expect(installedRow).toHaveTextContent('Installed');
    const rowButton = installedRow.querySelector('button');
    expect(rowButton).toBeDisabled();
  });

  it('requires a separate review before confirming installation', async () => {
    renderDialog();
    const review = await screen.findByTestId('app-manager-review');
    expect(review).toBeDisabled();
    fireEvent.click(await screen.findByRole('button', { name: 'Add HR Suite' }));
    expect(review).not.toBeDisabled();
    expect(mockBatchInstall).not.toHaveBeenCalled();
    fireEvent.click(review);
    expect(await screen.findByTestId('app-manager-apply')).toHaveTextContent('Install selected (1)');
    expect(mockBatchInstall).not.toHaveBeenCalled();
  });

  it('Apply installs only — does not call uninstall', async () => {
    const onChanged = vi.fn();
    mockBatchInstall.mockResolvedValue({
      installed: [
        {
          library_cp_id: 'lib-hr',
          app_id: 'app-new',
          status: 'active',
          name: 'HR Suite',
        },
      ],
      skipped: [],
      failed: [],
    });

    renderDialog({ onChanged });
    await showInstalled();
    await waitFor(() =>
      expect(screen.getByTestId('app-manager-installed')).toBeInTheDocument(),
    );

    expect(
      screen.getByTestId('app-manager-uninstall-app-installed'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Browse library/ }));
    const hrRow = (
      await screen.findByTestId('app-manager-row-hr-suite')
    ).querySelector('button');
    await act(async () => {
      fireEvent.click(hrRow!);
    });

    await confirmInstall();

    await waitFor(() => expect(mockBatchInstall).toHaveBeenCalled());
    expect(mockUninstall).not.toHaveBeenCalled();
    expect(mockBatchInstall).toHaveBeenCalledWith(
      [{ library_cp_id: 'lib-hr' }],
      { include_seed_data: true },
    );
    await waitFor(() =>
      expect(screen.getByTestId('app-manager-result')).toBeInTheDocument(),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it('opens uninstall modal from Uninstall control', async () => {
    renderDialog();
    await showInstalled();
    await waitFor(() =>
      expect(
        screen.getByTestId('app-manager-uninstall-app-installed'),
      ).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('app-manager-uninstall-app-installed'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('uninstall-confirm')).toBeInTheDocument(),
    );
  });

  it('disables Uninstall when preflight reports dependents', async () => {
    mockUninstallPreflight.mockResolvedValue({
      app_id: 'app-installed',
      can_uninstall: false,
      blocking_dependents: [
        { app_id: 'dep-1', app_name: 'Payroll', dep_key: 'content-factory' },
      ],
      blocking_references: [],
      entry_count: 0,
      requires_data_confirmation: false,
    });
    renderDialog();
    await showInstalled();
    await waitFor(() =>
      expect(
        screen.getByTestId('app-manager-uninstall-app-installed'),
      ).toBeDisabled(),
    );
    expect(
      screen.getByTestId('app-manager-uninstall-app-installed'),
    ).toHaveAttribute('title', expect.stringContaining('Payroll'));
  });

  it('transitions to settings finalize when batch returns awaiting_settings', async () => {
    mockBatchInstall.mockResolvedValue({
      installed: [
        {
          library_cp_id: 'lib-hr',
          app_id: 'app-pending',
          status: 'awaiting_settings',
          name: 'HR Suite',
          install_token: 'tok_1',
          settings_schema: {
            type: 'object',
            properties: {
              region: { type: 'string', title: 'Region' },
            },
          },
        },
      ],
      skipped: [],
      failed: [],
    });

    renderDialog();
    await waitFor(() =>
      expect(screen.getByTestId('app-manager-row-hr-suite')).toBeInTheDocument(),
    );

    const hrRow = (
      await screen.findByTestId('app-manager-row-hr-suite')
    ).querySelector('button');
    await act(async () => {
      fireEvent.click(hrRow!);
    });
    await confirmInstall();

    await waitFor(() =>
      expect(screen.getByTestId('app-settings-form')).toBeInTheDocument(),
    );
    expect(screen.getByText('Region')).toBeInTheDocument();
    expect(screen.getByText('Finish app setup')).toBeInTheDocument();
  });

  it('shows Needs settings badge for awaiting_settings apps', async () => {
    renderDialog({
      apps: [
        {
          ...INSTALLED_APP,
          lifecycle_state: 'awaiting_settings',
        },
      ],
    });
    await showInstalled();
    await waitFor(() =>
      expect(screen.getByText('Setup needed')).toBeInTheDocument(),
    );
  });
  it('reconciles an unknown install outcome without offering a blind retry', async () => {
    const onChanged = vi.fn();
    mockBatchInstall.mockRejectedValue({ code: 'ECONNABORTED' });
    renderDialog({ onChanged });
    const row = await screen.findByTestId('app-manager-row-hr-suite');
    await act(async () => { fireEvent.click(row.querySelector('button')!); });
    await confirmInstall();
    expect(await screen.findByText(/installation result is not confirmed/)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('app-manager-review')).toBeDisabled();
    expect(mockBatchInstall).toHaveBeenCalledTimes(1);
  });

  it("offers the host action for a failed row in a partially successful batch", async () => {
    const onAction = vi.fn();
    const onChanged = vi.fn();
    const failure = {
      library_cp_id: "lib-hr",
      name: "HR Suite",
      error: "Raw access denial",
      error_code: "access.required",
      details: { required_capability: "example" },
    };
    const resolver = vi.fn((err: unknown) =>
      err === failure
        ? {
            message: "Review your app access.",
            actionLabel: "Review access",
            onAction,
          }
        : null,
    );
    registerInstallDenialResolver(resolver);
    mockBatchInstall.mockResolvedValue({
      installed: [{ library_cp_id: "lib-other", name: "Another app" }],
      skipped: [],
      failed: [failure],
    });
    renderDialog({ onChanged });
    fireEvent.click(
      (await screen.findByTestId("app-manager-row-hr-suite")).querySelector(
        "button",
      )!,
    );
    await confirmInstall();
    expect(
      await screen.findByText("HR Suite — Review your app access."),
    ).toBeInTheDocument();
    expect(screen.getByText("HR Suite — Review your app access.").tagName).toBe('P');
    expect(screen.queryByText(/Raw access denial/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review access" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(failure);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(mockBatchInstall).toHaveBeenCalledTimes(1);
  });

  it("preserves an unmapped installation failure without promising recovery", async () => {
    mockBatchInstall.mockResolvedValue({
      installed: [],
      skipped: [],
      failed: [
        {
          library_cp_id: "lib-hr",
          name: "HR Suite",
          error: "Unsupported configuration",
          error_code: "install_failed",
        },
      ],
    });
    renderDialog();
    fireEvent.click(
      (await screen.findByTestId("app-manager-row-hr-suite")).querySelector(
        "button",
      )!,
    );
    await confirmInstall();
    expect(
      await screen.findByText("HR Suite — Unsupported configuration"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review access" }),
    ).not.toBeInTheDocument();
  });

  it("explains a blocked dependency without retrying the install", async () => {
    mockBatchInstall.mockResolvedValue({
      installed: [],
      skipped: [],
      failed: [
        {
          library_cp_id: "lib-hr",
          name: "HR Suite",
          error: "Dependency blocked",
          error_code: "app_dependency_error",
        },
      ],
    });
    renderDialog();
    fireEvent.click(
      (await screen.findByTestId("app-manager-row-hr-suite")).querySelector(
        "button",
      )!,
    );
    await confirmInstall();
    expect(
      await screen.findByText(
        /Resolve the required app installation or update/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'App change results' })).toBeInTheDocument();
    expect(screen.getByText(/Resolve the required app installation or update/).tagName).toBe('P');
    expect(mockBatchInstall).toHaveBeenCalledTimes(1);
  });
  it('keeps selections and custom details through search, tabs and review', async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: 'Add HR Suite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Customize details' }));
    fireEvent.change(screen.getByLabelText('App name for HR Suite'), { target: { value: 'Our People' } });
    fireEvent.change(screen.getByLabelText('App description for HR Suite'), { target: { value: 'Internal team operations' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search Apps' }), { target: { value: 'not-in-the-library' } });
    expect(screen.getByText('No Apps match your search.')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Installation selection' })).toHaveTextContent('Our People');
    await showInstalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    fireEvent.click(screen.getByRole('tab', { name: /Browse library/ }));
    expect(screen.getByRole('button', { name: 'Remove HR Suite' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('include-seed-data-toggle-checkbox'));
    mockBatchInstall.mockResolvedValue({ installed: [], skipped: [], failed: [] });
    fireEvent.click(screen.getByTestId('app-manager-review'));
    expect(screen.getByRole('complementary', { name: 'Installation selection' })).toHaveTextContent('Internal team operations');
    expect(mockBatchInstall).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('app-manager-apply'));
    await waitFor(() => expect(mockBatchInstall).toHaveBeenCalledWith(
      [{ library_cp_id: 'lib-hr', name: 'Our People', description: 'Internal team operations' }],
      { include_seed_data: false },
    ));
  });

  it('does not submit or dismiss when returning from review to selection', async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(await screen.findByRole('button', { name: 'Add HR Suite' }));
    fireEvent.click(screen.getByTestId('app-manager-review'));
    fireEvent.click(screen.getByRole('button', { name: 'Back to selection' }));
    expect(screen.getByTestId('app-manager-review')).not.toBeDisabled();
    expect(screen.queryByTestId('app-manager-apply')).not.toBeInTheDocument();
    expect(mockBatchInstall).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove HR Suite from selection' }));
    expect(screen.getByTestId('app-manager-review')).toBeDisabled();
  });

  it('preserves the selection in the mobile review view and returns to the catalog', async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: 'Add HR Suite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review (1)' }));
    expect(screen.getByRole('button', { name: 'Back to library' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(screen.getByRole('button', { name: 'Remove HR Suite' })).toHaveAttribute('aria-pressed', 'true');
    expect(mockBatchInstall).not.toHaveBeenCalled();
  });

  it('requires a nonempty installation name', async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: 'Add HR Suite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Customize details' }));
    fireEvent.change(screen.getByLabelText('App name for HR Suite'), { target: { value: '  ' } });
    expect(screen.getByTestId('app-manager-review')).toBeDisabled();
  });

  it('hides uninstall from nonowners and keeps setup recovery visible', async () => {
    renderDialog({ apps: [{ ...INSTALLED_APP, owner_user_id: 'another-user', lifecycle_state: 'awaiting_settings' }] });
    await showInstalled();
    expect(await screen.findByRole('button', { name: 'Finish setup' })).toBeInTheDocument();
    expect(screen.queryByTestId('app-manager-uninstall-app-installed')).not.toBeInTheDocument();
  });

  it('retries a failed library load without installing anything', async () => {
    mockListProfiles.mockRejectedValueOnce(new Error('Library unavailable'));
    renderDialog();
    expect(await screen.findByRole('alert')).toHaveTextContent('Library unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry library' }));
    expect(await screen.findByRole('button', { name: 'Add HR Suite' })).toBeInTheDocument();
    expect(mockBatchInstall).not.toHaveBeenCalled();
  });

  it('makes Create your own app a prominent, separate action', async () => {
    const onCreateBlankApp = vi.fn();
    renderDialog({ onCreateBlankApp });
    const create = await screen.findByRole('button', { name: 'Create your own app' });
    expect(create).toHaveAttribute('data-variant', 'secondary');
    fireEvent.click(create);
    expect(onCreateBlankApp).toHaveBeenCalledTimes(1);
    expect(mockBatchInstall).not.toHaveBeenCalled();
  });

  it('keeps keyboard focus on navigation when leaving mobile review', async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: 'Add HR Suite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review (1)' }));
    fireEvent.click(screen.getByTestId('app-manager-review'));
    const back = screen.getByRole('button', { name: 'Back to library' });
    back.focus();
    fireEvent.click(back);
    expect(screen.getByRole('button', { name: 'Review (1)' })).toHaveFocus();
  });

  it('switches library tabs with the keyboard without dropping the selection', async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: 'Add HR Suite' }));
    const browse = screen.getByRole('tab', { name: /Browse library/ });
    browse.focus();
    fireEvent.keyDown(browse, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Installed/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: /Installed/ }), { key: 'Home' });
    expect(screen.getByRole('button', { name: 'Remove HR Suite' })).toHaveAttribute('aria-pressed', 'true');
    expect(mockBatchInstall).not.toHaveBeenCalled();
  });

});
