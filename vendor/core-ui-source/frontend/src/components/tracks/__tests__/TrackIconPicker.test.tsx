import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TrackIconPicker } from '../TrackIconPicker';
import { TrackDot } from '../../ui';

it('offers keyboard-operable built-in choices and an explicit default dot', () => {
  const onChange = vi.fn();
  render(<TrackIconPicker value="" onChange={onChange} />);
  const select = screen.getByRole('combobox', { name: 'Track icon' });
  expect(select).toHaveValue('');
  expect(screen.getByRole('option', { name: 'Dot (default)' })).toBeInTheDocument();
  fireEvent.change(select, { target: { value: 'briefcase' } });
  expect(onChange).toHaveBeenCalledWith('briefcase');
});

it('cannot change the icon while saving', () => {
  render(<TrackIconPicker value="briefcase" onChange={vi.fn()} disabled />);
  expect(screen.getByRole('combobox', { name: 'Track icon' })).toBeDisabled();
});

it.each([undefined, '', 'unknown-icon', 'https://example.com/icon.svg', 'data:image/svg+xml;base64,PHN2Zy8+'])(
  'uses a dot for missing or unsupported icon %s without loading external content', icon => {
    const { container } = render(<TrackDot icon={icon} />);
    expect(container.querySelector('svg, img, iframe')).toBeNull();
    expect(container.querySelector('span')).toHaveClass('rounded-full');
  },
);

it('uses a bundled symbol for a supported icon', () => {
  const { container } = render(<TrackDot icon="briefcase" />);
  expect(container.querySelector('svg')).not.toBeNull();
  expect(container.querySelector('img')).toBeNull();
});
