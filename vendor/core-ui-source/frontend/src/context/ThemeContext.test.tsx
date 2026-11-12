import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import html from '../../index.html?raw';
import { ThemeProvider, useTheme } from './ThemeContext';

function Toggle() {
  const { toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>Switch theme</button>;
}

afterEach(() => {
  cleanup();
  document.getElementById('app-favicon')?.remove();
  document.documentElement.classList.remove('theme-dark');
  localStorage.removeItem('t75_theme');
});

it('follows system appearance at startup and on changes independently of the workspace theme', () => {
  const page = new DOMParser().parseFromString(html, 'text/html');
  const icon = page.querySelector<HTMLLinkElement>('#app-favicon')!;
  const bootstrap = Array.from(page.scripts).find(script => script.text.includes('updateFavicon'))!;
  document.head.append(icon);

  let notifyAppearanceChange = () => {};
  const media = {
    matches: true,
    addEventListener(event: string, listener: () => void) {
      expect(event).toBe('change');
      notifyAppearanceChange = listener;
    },
  };
  const browser = {
    matchMedia(query: string) {
      expect(query).toBe('(prefers-color-scheme: dark)');
      return media;
    },
  };
  localStorage.setItem('t75_theme', 'light');
  new Function('document', 'window', 'localStorage', bootstrap.text)(document, browser, localStorage);
  expect(icon.getAttribute('href')).toMatch(/^\/integral-logo-white\.svg\?/);
  expect(document.documentElement.classList.contains('theme-dark')).toBe(false);

  render(<ThemeProvider><Toggle /></ThemeProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Switch theme' }));
  expect(icon.getAttribute('href')).toMatch(/^\/integral-logo-white\.svg\?/);
  expect(document.documentElement.classList.contains('theme-dark')).toBe(true);

  media.matches = false;
  notifyAppearanceChange();
  expect(icon.getAttribute('href')).toMatch(/^\/integral-logo\.svg\?/);
  expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
});
