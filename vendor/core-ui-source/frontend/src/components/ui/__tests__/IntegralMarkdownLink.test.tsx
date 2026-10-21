import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import {
  IntegralMarkdownLink,
  isInternalAppHref,
} from '../IntegralMarkdownLink';

function renderLink(href: string, label = 'Open') {
  return renderToStaticMarkup(
    <MemoryRouter>
      <IntegralMarkdownLink href={href}>{label}</IntegralMarkdownLink>
    </MemoryRouter>,
  );
}

describe('isInternalAppHref', () => {
  it('accepts relative in-app paths', () => {
    expect(isInternalAppHref('/tracks/n.Track.abc')).toBe(true);
    expect(isInternalAppHref('/apps/n.App.xyz')).toBe(true);
  });

  it('accepts a canonical-host path normalized by markdown tooling', () => {
    expect(isInternalAppHref('https://integral.ai/tracks/n.Track.abc?entry=e-1')).toBe(true);
  });

  it('rejects external and unsafe hrefs', () => {
    expect(isInternalAppHref('https://example.com')).toBe(false);
    expect(isInternalAppHref('//evil.com')).toBe(false);
    expect(isInternalAppHref('javascript:alert(1)')).toBe(false);
  });
});

describe('IntegralMarkdownLink', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('does not activate the surrounding entry card when a link is clicked', () => {
    const openEntry = vi.fn();
    const clickLink = vi.fn();
    render(
      <MemoryRouter>
        <article onClick={openEntry}>
          <IntegralMarkdownLink href="/apps/n.WorkspaceApp.smoke" onClick={clickLink}>
            Open QA App
          </IntegralMarkdownLink>
        </article>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Open QA App' }));
    expect(clickLink).toHaveBeenCalledOnce();
    expect(openEntry).not.toHaveBeenCalled();
  });
  it('renders React Router link for internal paths', () => {
    const html = renderLink('/tracks/t-1', 'My track');
    expect(html).toContain('href="/tracks/t-1"');
    expect(html).toContain('My track');
    expect(html).not.toContain('target="_blank"');
  });

  it('renders external anchor for https URLs', () => {
    const html = renderLink('https://example.com/docs', 'Docs');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('repairs a double slash only for typed Core resource links', () => {
    const html = renderLink('//entries/n.Entry.smoke', 'Saved record');
    expect(html).toContain('href="/entries/n.Entry.smoke"');
    expect(html).not.toContain('target="_blank"');
    expect(isInternalAppHref('//tracks/n.Track.smoke?entry=n.Entry.smoke')).toBe(true);
    expect(isInternalAppHref('//apps/n.WorkspaceApp.smoke')).toBe(true);
    expect(isInternalAppHref('//entries.example.com/n.Entry.smoke')).toBe(false);
    expect(isInternalAppHref('//entries/arbitrary-path')).toBe(false);
    expect(renderLink('//example.com/docs')).toContain('target="_blank"');
  });

  it('keeps canonical-host record links in the current workspace', () => {
    const html = renderLink(
      'https://integral.ai/tracks/t-1?entry=e-1',
      'My record',
    );
    expect(html).toContain('href="/tracks/t-1?entry=e-1"');
    expect(html).not.toContain('target="_blank"');
  });

  it('keeps absolute current-origin citations in this tab and preserves their target', () => {
    vi.stubGlobal('location', new URL('http://localhost:3000'));
    const url = new URL('/tracks/n.Track.saved?entry=n.Entry.saved#notes', window.location.origin).href;
    const html = renderLink(url);
    expect(html).toContain('href="/tracks/n.Track.saved?entry=n.Entry.saved#notes"');
    expect(html).not.toContain('target="_blank"');
    expect(isInternalAppHref('https://another-installation.example/tracks/n.Track.saved')).toBe(false);
  });

  it('repairs typed local-placeholder citations while leaving external links external', () => {
    for (const origin of ['https://integral.local', 'http://integral.local', 'https://integral.app']) {
      const html = renderLink(`${origin}/tracks/n.Track.saved?entry=n.Entry.saved#section`);
      expect(html).toContain('href="/tracks/n.Track.saved?entry=n.Entry.saved#section"');
      expect(html).not.toContain('target="_blank"');
      expect(isInternalAppHref(`${origin}/entries/n.Entry.saved`)).toBe(true);
      expect(isInternalAppHref(`${origin}/apps/n.WorkspaceApp.saved`)).toBe(true);
    }
    for (const href of [
      'https://integral.local/help',
      'https://integral.local/tracks/arbitrary',
      'https://integral.local.example.com/tracks/n.Track.saved',
      'https://integral.local:444/tracks/n.Track.saved',
      'https://user:secret@integral.local/tracks/n.Track.saved',
      'https://foreign.example/tracks/n.Track.saved',
      'https://integral.ai//foreign.example/path',
    ]) {
      expect(renderLink(href)).toContain('target="_blank"');
    }
  });

  it('ignores renderer-supplied new-tab targets for local links', () => {
    const html = renderToStaticMarkup(<MemoryRouter>
      <IntegralMarkdownLink href="/entries/n.Entry.saved" target="_blank">Record</IntegralMarkdownLink>
    </MemoryRouter>);
    expect(html).not.toContain('target="_blank"');
  });

  it('keeps typed legacy placeholder links local without rewriting ordinary external URLs', () => {
    const html = renderLink('https://integral.app/tracks/n.Track.saved?entry=n.Entry.saved');
    expect(html).toContain('href="/tracks/n.Track.saved?entry=n.Entry.saved"');
    expect(html).not.toContain('target="_blank"');
    for (const href of [
      'https://integral.app/help',
      'https://integral.app/tracks/arbitrary',
      'https://integral.app.example.com/tracks/n.Track.saved',
      'https://integral.app:444/tracks/n.Track.saved',
    ]) {
      expect(renderLink(href)).toContain('target="_blank"');
    }
  });
});
