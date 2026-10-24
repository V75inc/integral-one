import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AppSettingsModal } from './AppSettingsModal';

const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), toast: vi.fn(), close: vi.fn() }));
vi.mock('../../api/apps', () => ({ appsApi: { getAppSettings: mocks.get, updateAppSettings: mocks.save } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('../access/AppFunctionAccess', () => ({ AppFunctionAccess: () => <div>Function roles</div> }));
const configured = { settings_schema: { type: 'object', properties: { prefix: { type: 'string', title: 'Record prefix', default: 'REC' } } }, settings: { prefix: 'REC' } };
const show = (props = {}) => render(<AppSettingsModal open appId="app" appName="Example" onClose={mocks.close} {...props}/>);
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(configured); mocks.save.mockResolvedValue({}); });

it('saves only a changed value and confirms it once through a toast', async () => {
  show();
  const field = await screen.findByLabelText('Record prefix');
  expect(field).toHaveValue('REC');
  expect(screen.getByRole('button', {name:'Save settings'})).toBeDisabled();
  fireEvent.change(field, {target:{value:'NOTE'}});
  fireEvent.click(screen.getByRole('button', {name:'Save settings'}));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('app', {prefix:'NOTE'}));
  expect(mocks.toast).toHaveBeenCalledWith('App settings saved.', 'success');
  expect(mocks.close).toHaveBeenCalledOnce();
});
it('disables Save again when changes are reverted', async () => {
  show(); const field = await screen.findByLabelText('Record prefix');
  fireEvent.change(field, {target:{value:'TEMP'}});
  fireEvent.change(field, {target:{value:'REC'}});
  expect(screen.getByRole('button', {name:'Save settings'})).toBeDisabled();
});
it('offers no Save action when the App has no settings', async () => {
  mocks.get.mockResolvedValue({settings_schema:{},settings:{}}); show();
  await screen.findByText('This App has no configurable settings.');
  expect(screen.queryByRole('button', {name:'Save settings'})).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
});
it('preserves the edited draft after a save error and reports that error in a toast', async () => {
  mocks.save.mockRejectedValue(new Error('Save unavailable')); show();
  const field = await screen.findByLabelText('Record prefix');
  fireEvent.change(field, {target:{value:'KEEP'}});
  fireEvent.click(screen.getByRole('button', {name:'Save settings'}));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.any(String),'error'));
  expect(field).toHaveValue('KEEP'); expect(mocks.close).not.toHaveBeenCalled();
  expect(screen.queryByTestId('app-settings-modal-error')).toBeNull();
});
it('offers a retry after loading fails and restores the form', async () => {
  mocks.get.mockRejectedValueOnce(new Error('Load unavailable')); show();
  fireEvent.click(await screen.findByRole('button', {name:'Retry settings'}));
  expect(await screen.findByLabelText('Record prefix')).toHaveValue('REC');
  expect(mocks.get).toHaveBeenCalledTimes(2);
});
it('opens directly to function access when it is the only applicable settings section', async () => {
  mocks.get.mockResolvedValue({settings_schema:{},settings:{}});
  show({initialSection:'access',functionAccessWorkspaceId:'ws'});
  expect(await screen.findByText('Function roles')).toBeVisible();
  expect(screen.queryByRole('tab', {name:'Settings'})).toBeNull();
  expect(screen.queryByRole('button', {name:'Save settings'})).toBeNull();
});
