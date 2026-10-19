import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VisibilityField } from './VisibilityField';

afterEach(cleanup);

describe('VisibilityField', () => {
  it('offers explicit App choices without inherit', () => {
    const onChange = vi.fn();
    render(<VisibilityField value="private" onChange={onChange} workspaceAvailable inheritHint="" />);
    expect(screen.queryByRole('button', { name: /Inherit/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Private/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Workspace/ }));
    expect(onChange).toHaveBeenLastCalledWith('workspace');
    fireEvent.click(screen.getByRole('button', { name: /Public/ }));
    expect(onChange).toHaveBeenLastCalledWith('public');
  });

  it('requires workspace context for workspace access', () => {
    const onChange = vi.fn();
    render(<VisibilityField value="private" onChange={onChange} workspaceAvailable={false} inheritHint="" />);
    fireEvent.click(screen.getByRole('button', { name: /Workspace/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('explains a legacy Track without offering inheritance', () => {
    render(<VisibilityField value="inherit" onChange={vi.fn()} workspaceAvailable inheritHint="Matches this App" />);
    expect(screen.queryByRole('button', { name: /Inherit/ })).toBeNull();
    expect(screen.getByText('Matches this App')).toBeTruthy();
  });
});
