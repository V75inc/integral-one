import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, expect, it} from 'vitest';
import axe from 'axe-core';
import {AppPage, AppHeader, AppSection, AppField, AppGrid, AppActions, AppSummary, AppNotice} from './AppPatterns';
import {Input} from './Input';
import {Button} from '../components/ui/Button';
import {appTheme, SDK_VERSION, themeTokens} from '@integral/sdk-react';

afterEach(cleanup);
it('associates labels, required controls, help and errors with stable unique IDs', async () => {
  const view = render(<><AppField label="Reference" required help="Use a short reference" error="Required">{binding => <Input {...binding} />}</AppField><AppField label="Other">{binding => <Input {...binding} />}</AppField></>);
  const input = screen.getByRole('textbox', {name: 'Reference'});
  expect(input).toBeRequired();
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription('Use a short reference Required');
  const id = input.id;
  view.rerender(<><AppField label="Reference" help="Use a short reference">{binding => <Input {...binding} />}</AppField><AppField label="Other">{binding => <Input {...binding} />}</AppField></>);
  expect(screen.getByRole('textbox', {name: 'Reference'}).id).toBe(id);
  expect(screen.getByRole('textbox', {name: 'Other'}).id).not.toBe(id);
  expect(screen.queryByRole('alert')).toBeNull();
});
it('keeps DOM order and keyboard input in responsive shared composition without accessibility violations', async () => {
  const user = userEvent.setup();
  const {container} = render(<AppPage><AppHeader title="New record" /><AppSection title="Details"><AppGrid columns={3} data-testid="grid">
    <AppField label="Name">{binding => <Input {...binding} />}</AppField><AppField label="Reference">{binding => <Input {...binding} />}</AppField>
  </AppGrid><AppActions><Button>Continue</Button></AppActions></AppSection><AppSummary title="Summary" rows={[{key: 'count', label: 'Items', value: 2, emphasis: true}]} /><AppNotice>Ready</AppNotice></AppPage>);
  expect(screen.getByTestId('grid')).toHaveClass('grid-cols-1', 'md:grid-cols-3');
  await user.tab(); await user.keyboard('Example');
  expect(screen.getByRole('textbox', {name: 'Name'})).toHaveValue('Example');
  await user.tab(); expect(screen.getByRole('textbox', {name: 'Reference'})).toHaveFocus();
  await user.tab(); expect(screen.getByRole('button', {name: 'Continue'})).toHaveFocus();
  expect(screen.getByRole('status')).toHaveTextContent('Ready');
  expect((await axe.run(container, {rules: {'color-contrast': {enabled: false}}})).violations).toEqual([]);
});
it('uses inherited semantic theme aliases and preserves legacy aliases', () => {
  expect(SDK_VERSION).toBe('1.2.0');
  expect(Object.isFrozen(appTheme)).toBe(true);
  for (const value of Object.values(appTheme)) expect(value).toMatch(/^var\(--/);
  expect(themeTokens.background).toBe('var(--bg)');
  expect(themeTokens.danger).toBe('var(--danger)');
  render(<AppNotice tone="danger">Failed</AppNotice>);
  expect(screen.getByRole('alert')).toHaveTextContent('Failed');
});
