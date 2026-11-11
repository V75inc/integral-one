import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
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

it('uses the dark icon on the light theme and the white icon on the dark theme', () => {
  const icon = document.createElement('link');
  icon.id = 'app-favicon';
  icon.rel = 'icon';
  icon.dataset.light = '/integral-logo.svg';
  icon.dataset.dark = '/integral-logo-white.svg';
  document.head.append(icon);

  localStorage.setItem('t75_theme', 'light');
  render(<ThemeProvider><Toggle /></ThemeProvider>);
  expect(icon.getAttribute('href')).toBe(icon.dataset.light);
  fireEvent.click(screen.getByRole('button', { name: 'Switch theme' }));
  expect(icon.getAttribute('href')).toBe(icon.dataset.dark);
  expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
});
