import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppIcon } from './AppIcon';

describe('AppIcon', () => {
  it('uses initials when a logo fails and retries a replacement logo', () => {
    const first = 'data:image/png;base64,aGVsbG8=';
    const next = 'data:image/png;base64,d29ybGQ=';
    const { container, rerender } = render(<AppIcon name="Project Desk" icon={first} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container).toHaveTextContent('PD');
    rerender(<AppIcon name="Project Desk" icon={next} />);
    expect(container.querySelector('img')).toHaveAttribute('src', next);
  });
  it('does not load remote URLs or SVG data', () => {
    const { container, rerender } = render(<AppIcon name="My App" icon="https://example.com/logo.png" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('MA');
    rerender(<AppIcon name="My App" icon="data:image/svg+xml;base64,PHN2Zy8+" />);
    expect(container.querySelector('img')).toBeNull();
  });
});
