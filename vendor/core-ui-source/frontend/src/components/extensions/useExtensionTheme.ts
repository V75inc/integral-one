import { useEffect, useState } from 'react';

/** Current public design tokens; a view never needs to read its parent's DOM. */
function snapshot(): Record<string, string> {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const values: Record<string, string> = {
    // Core marks dark mode with ``theme-dark`` (ThemeContext); ``dark`` is kept for older hosts.
    colorScheme:
      root.classList.contains('theme-dark') || root.classList.contains('dark')
        ? 'dark'
        : 'light',
    fontFamily: style.fontFamily || 'system-ui, sans-serif',
  };
  for (const key of ['--bg', '--panel', '--panel-2', '--text', '--text-muted', '--text-subtle', '--brand-accent', '--panel-border', '--radius-card', '--radius-input']) {
    values[key] = style.getPropertyValue(key).trim();
  }
  return values;
}
export function useExtensionTheme(): Record<string, string> {
  const [theme, setTheme] = useState(snapshot);
  useEffect(() => {
    const update = () => setTheme(previous => {
      const next = snapshot(); return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
    });
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
