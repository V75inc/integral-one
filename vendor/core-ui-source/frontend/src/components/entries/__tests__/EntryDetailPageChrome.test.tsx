import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AttachmentRow } from '../attachments/AttachmentRow';
import { EntryDetailPageChrome } from '../EntryDetailPageChrome';

const media = vi.hoisted(() => ({ wide: true }));
vi.mock('../../../hooks/useMediaQuery', () => ({ useMatchesMedia: () => media.wide }));
afterEach(() => { cleanup(); media.wide = true; vi.restoreAllMocks(); });

describe('full-page entry utilities', () => {
  it('renders one full-height companion panel only when supplied', () => {
    render(<EntryDetailPageChrome title="Document" onClose={() => {}}
      sidePanel={<div>Attachments and comments</div>}>
      <p>Saved record</p>
    </EntryDetailPageChrome>);
    expect(screen.getByRole('complementary', { name: 'Entry utilities' })).toBeVisible();
    expect(screen.getAllByText('Attachments and comments')).toHaveLength(1);
    expect(screen.getByText('Saved record')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close details panel' })).toBeVisible();
    expect(screen.getByTestId('entry-page-utilities')).toHaveClass('fixed', 'bottom-0');
  });

  it('respects hide/show without duplicating content or losing the record', () => {
    const props = { title: 'Document', onClose: () => {} };
    const { rerender } = render(<EntryDetailPageChrome {...props} sidePanel={<p>Files</p>}><p>Record</p></EntryDetailPageChrome>);
    rerender(<EntryDetailPageChrome {...props}><p>Record</p></EntryDetailPageChrome>);
    expect(screen.queryByTestId('entry-page-utilities')).not.toBeInTheDocument();
    expect(screen.getByText('Record')).toBeVisible();
    rerender(<EntryDetailPageChrome {...props} sidePanel={<p>Files</p>}><p>Record</p></EntryDetailPageChrome>);
    expect(screen.getAllByText('Files')).toHaveLength(1);
  });

  it('uses one full-height drawer on narrow screens with the standard dismissal contract', () => {
    media.wide = false;
    const close = vi.fn();
    render(<EntryDetailPageChrome title="Record" onClose={() => {}} panelTitle="Attachments" onPanelClose={close} sidePanel={<p>Files</p>}><p>Record body</p></EntryDetailPageChrome>);
    const drawer = screen.getByRole('dialog', { name: 'Attachments' });
    expect(drawer).toHaveClass('h-[calc(100dvh-var(--system-bar-h,0px))]');
    expect(screen.getAllByText('Files')).toHaveLength(1);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps desktop utilities nonmodal beside chat when the page is squeezed', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 590, top: 100, right: window.innerWidth - 420 } as DOMRect);
    render(<EntryDetailPageChrome allowAssistantDock onClose={() => {}} panelTitle="Attachments" sidePanel={<p>Files</p>}><p>Record body</p></EntryDetailPageChrome>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Entry utilities' })).toBeVisible();
    expect(screen.getByText('Record body')).toBeVisible();
    expect(screen.getByTestId('entry-page-utilities')).toHaveStyle({ right: '420px', width: '380px' });
    expect(screen.getByTestId('entry-page-utilities').parentElement).toBe(document.body);
  });

  it('closes the desktop panel through its explicit close control', () => {
    const close = vi.fn();
    render(<EntryDetailPageChrome onClose={() => {}} onPanelClose={close} sidePanel={<p>Files</p>}><p>Body</p></EntryDetailPageChrome>);
    fireEvent.click(screen.getByRole('button', { name: 'Close details panel' }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('retains canvas and fields when a companion panel is supplied', () => {
    render(<EntryDetailPageChrome onClose={() => {}} canvas={<p>Canvas</p>} sidePanel={<p>Files</p>}><p>Fields</p></EntryDetailPageChrome>);
    expect(screen.getByText('Canvas')).toBeVisible();
    expect(screen.getByText('Fields')).toBeVisible();
    expect(screen.getByText('Files')).toBeVisible();
  });
});

describe('attachment revision identification', () => {
  it('shows the added timestamp for retained same-name files', () => {
    const createdAt = '2026-10-08T02:34:19Z';
    render(<AttachmentRow attachment={{ id: 'file-1', filename: 'brief.pdf', mime_type: 'application/pdf', created_at: createdAt }} onOpen={() => {}} onDownload={() => {}} onCopyLink={() => {}} />);
    expect(screen.getByText((text) => text.includes(`Added ${new Date(createdAt).toLocaleString()}`))).toBeVisible();
  });
});
