import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { Field } from '../Field';
import { Input } from '../../ui';
import { TextInput } from '../../features/settings/components/Field';

afterEach(cleanup);
describe('Field control association', () => {
  it('associates a generated label, hint and validation with the input', () => {
    render(<Field label="Endpoint" hint="An HTTPS URL" error="Required" required><Input /></Field>);
    const input = screen.getByRole('textbox', { name: 'Endpoint' });
    expect(input).toHaveAccessibleDescription('An HTTPS URL Required');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
  });
  it('uses an explicit control id without nesting labels', () => {
    const { container } = render(<Field label="Name" htmlFor="name"><Input id="name" /></Field>);
    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'name');
    expect(container.querySelector('label label')).toBeNull();
  });
  it('associates compatibility text inputs used in settings forms', () => {
    render(<Field label="Policy scope"><TextInput value="" onChange={() => {}} /></Field>);
    expect(screen.getByRole('textbox', { name: 'Policy scope' })).toBeInTheDocument();
  });
});
