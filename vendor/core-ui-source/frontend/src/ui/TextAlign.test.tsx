import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Text } from './Text';
import { Inline } from './Inline';

describe('Text alignment and numbers', () => {
  it('right-aligns and uses equal-width digits when asked, and does neither otherwise', () => {
    render(<><Text align="end" numeric>1,234.00</Text><Text>plain</Text></>);
    expect(screen.getByText('1,234.00').className).toContain('text-right');
    expect(screen.getByText('1,234.00').className).toContain('tabular-nums');
    expect(screen.getByText('plain').className).not.toContain('text-right');
    expect(screen.getByText('plain').className).not.toContain('tabular-nums');
  });
  it('Inline spreads its children apart and wraps when asked', () => {
    const { container } = render(<Inline justify="between" wrap><span>a</span><span>b</span></Inline>);
    expect((container.firstChild as HTMLElement).className).toContain('justify-between');
    expect((container.firstChild as HTMLElement).className).toContain('flex-wrap');
  });
});
