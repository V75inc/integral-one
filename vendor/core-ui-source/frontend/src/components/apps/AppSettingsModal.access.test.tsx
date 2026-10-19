import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
vi.mock('../../api/apps', () => ({ appsApi: { getAppSettings: vi.fn().mockResolvedValue({ settings_schema: {} }) } }));
vi.mock('./AppSettingsForm', () => ({ AppSettingsForm: () => <div>Package settings</div> }));
vi.mock('../access/AppFunctionAccess', () => ({ AppFunctionAccess: () => <div>Function roles</div> }));
import { AppSettingsModal } from './AppSettingsModal';
afterEach(cleanup);
it('shows function access only when owner authority is supplied', async () => {
  const { rerender } = render(<AppSettingsModal open appId="app" appName="Example" onClose={() => {}} />);
  expect(screen.queryByRole('tab', { name: 'Function access' })).not.toBeInTheDocument();
  rerender(<AppSettingsModal open appId="app" appName="Example" functionAccessWorkspaceId="ws" onClose={() => {}} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Function access' }));
  expect(await screen.findByText('Function roles')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
});
