import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LineChart } from './LineChart';
import { BridgeChart } from './BridgeChart';

describe('LineChart', () => {
  const props = { labels: ['Nov 2026', 'Dec 2026', 'Jan 2027'], ariaLabel: 'Pay over the last 3 runs', series: [{ key: 'gross', label: 'Gross pay', values: [20_000_000, 19_800_000, 21_000_000] }, { key: 'net', label: 'Net pay', values: [17_400_000, 16_900_000, 18_000_000] }] };

  it('draws one line per series with a legend, short axis labels and an end value', () => {
    const { container } = render(<LineChart {...props} />);
    expect(screen.getByRole('img', { name: 'Pay over the last 3 runs' })).toBeTruthy();
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
    expect(screen.getByText('Gross pay')).toBeTruthy();
    expect(screen.getByText('Net pay')).toBeTruthy();
    expect(screen.getByText('21.0M')).toBeTruthy();
    expect(screen.getByText('Nov 2026')).toBeTruthy();
  });

  it('gives every point a hover tip, and draws nothing for fewer than two points', () => {
    const { container, rerender } = render(<LineChart {...props} tooltips={['a', 'b', 'c']} />);
    expect(Array.from(container.querySelectorAll('title')).map(t => t.textContent)).toEqual(['a', 'b', 'c']);
    rerender(<LineChart {...props} labels={['Nov']} series={[{ key: 'gross', label: 'Gross pay', values: [1] }]} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('BridgeChart', () => {
  const steps = [{ key: 'a', label: 'Bonus and taxed allowances', value: -743000 }, { key: 'p', label: 'PAYE', value: 159130 }, { key: 'n', label: 'NIS', value: 22400 }];

  it('draws a bar per reason, to the right for increases and the left for decreases, with signed amounts', () => {
    const { container } = render(<BridgeChart steps={steps} ariaLabel="What changed net pay" upLabel="Added to net pay" downLabel="Took from net pay" />);
    expect(screen.getByRole('img', { name: 'What changed net pay' })).toBeTruthy();
    const bars = Array.from(container.querySelectorAll('rect'));
    expect(bars).toHaveLength(3);
    expect(bars[0].getAttribute('fill')).toBe('var(--viz-down)');
    expect(bars[1].getAttribute('fill')).toBe('var(--viz-up)');
    expect(screen.getByText('−743K')).toBeTruthy();
    expect(screen.getByText('+159K')).toBeTruthy();
    expect(screen.getByText('Added to net pay')).toBeTruthy();
    expect(bars[0].querySelector('title')?.textContent).toBe('Bonus and taxed allowances: −743,000');
  });

  it('draws nothing when nothing changed', () => {
    const { container } = render(<BridgeChart steps={[]} ariaLabel="x" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('BridgeChart labels', () => {
  it('keeps a long label inside the chart and still shows it in full on hover', () => {
    const long = 'A very long reason for the change in net pay that will not fit';
    const { container } = render(<BridgeChart steps={[{ key: 'a', label: long, value: 5000 }]} ariaLabel="x" />);
    const label = Array.from(container.querySelectorAll('text')).find(t => t.textContent?.endsWith('…'));
    expect(label).toBeTruthy();
    expect(long.startsWith((label!.textContent || '').slice(0, -1))).toBe(true);
    expect(container.querySelector('title')?.textContent).toContain(long);
  });
});
