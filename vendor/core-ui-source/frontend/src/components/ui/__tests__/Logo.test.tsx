import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import logoMaster from '../../../../public/integral-logo.svg?raw';
import { Logo, LogoMark } from '../Logo';
import { PRODUCT_NAME } from '../../../brand';
import { AuthPageLayout } from '../AuthPageLayout';
import { INTEGRAL_LOGO_HALF_PATH } from '../../../brandLogo';

describe('approved Integral logo', () => {
  it('matches the current vector master, with transparent negative space', () => {
    const { container } = render(<LogoMark size="lg" />);
    const svg = container.querySelector('svg')!;
    const master = new DOMParser().parseFromString(
      logoMaster,
      'image/svg+xml',
    ).documentElement;
    expect(svg.getAttribute('viewBox')).toBe(master.getAttribute('viewBox'));
    expect(svg.getAttribute('width')).toBe('40');
    expect(svg.style.color).toBe('var(--logo-mark)');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    const paths = svg.querySelectorAll('path');
    expect(Array.from(paths, path => path.getAttribute('d'))).toEqual([
      INTEGRAL_LOGO_HALF_PATH, INTEGRAL_LOGO_HALF_PATH,
    ]);
    expect(paths[0].getAttribute('transform')).toBe('translate(0 -32)');
    expect(paths[1].getAttribute('transform')).toBe('translate(0 32) rotate(180 360 360)');
    expect(Array.from(paths, path => [path.getAttribute('d'), path.getAttribute('transform')])).toEqual(
      Array.from(master.querySelectorAll('path'), path => [path.getAttribute('d'), path.getAttribute('transform')]),
    );
    expect(svg.querySelector('rect')).toBeNull();
  });

  it('renders simultaneous marks and gives the home link a name', () => {
    const { container, getByRole } = render(
      <MemoryRouter>
        <Logo to="/" markOnly />
        <LogoMark />
      </MemoryRouter>,
    );
    expect(getByRole('link', { name: `${PRODUCT_NAME} — go to dashboard` }).getAttribute('href')).toBe('/');
    expect(container.querySelectorAll('svg')).toHaveLength(2);
    expect(container.querySelectorAll('path')).toHaveLength(4);
  });

  it('uses the master geometry for the stationary authentication outline', () => {
    const { container } = render(
      <MemoryRouter>
        <AuthPageLayout title="Welcome" description="Your workspace">
          <button type="button">Continue</button>
        </AuthPageLayout>
      </MemoryRouter>,
    );
    const master = new DOMParser().parseFromString(logoMaster, 'image/svg+xml').documentElement;
    const backdrop = container.querySelector('svg.auth-ripple')!;
    expect(backdrop.getAttribute('viewBox')).toBe(master.getAttribute('viewBox'));
    const geometry = (paths: NodeListOf<SVGPathElement>) => Array.from(
      paths, path => [path.getAttribute('d'), path.getAttribute('transform')],
    );
    for (const outline of backdrop.querySelectorAll('g')) {
      expect(geometry(outline.querySelectorAll('path'))).toEqual(geometry(master.querySelectorAll('path')));
    }
    expect(backdrop.querySelectorAll('g')).toHaveLength(1);
    expect(backdrop.querySelector('rect')).toBeNull();
  });
});
