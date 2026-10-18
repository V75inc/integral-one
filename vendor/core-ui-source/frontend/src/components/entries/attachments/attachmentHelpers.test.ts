import { describe, expect, it } from 'vitest';

import {
  canViewInApp,
  formatDuration,
  resolveViewerKind,
  shortHash,
  thumbnailSrc,
} from './attachmentHelpers';
import type { Attachment } from '../../../types';

function att(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'a1',
    filename: 'file.bin',
    source_type: 'file',
    mime_type: 'application/octet-stream',
    ...overrides,
  };
}

describe('resolveViewerKind', () => {
  it('routes images to the image viewer', () => {
    expect(resolveViewerKind(att({ mime_type: 'image/png' }))).toBe('image');
    expect(resolveViewerKind(att({ mime_type: 'image/jpeg' }))).toBe('image');
  });

  it('routes PDFs to the pdf viewer', () => {
    expect(resolveViewerKind(att({ mime_type: 'application/pdf' }))).toBe(
      'pdf'
    );
  });

  it('routes docx to mammoth and xlsx to SheetJS', () => {
    expect(
      resolveViewerKind(
        att({
          mime_type:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
      )
    ).toBe('docx');
    expect(
      resolveViewerKind(
        att({
          mime_type:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
      )
    ).toBe('xlsx');
  });

  it('routes pptx through the server-rendered preview', () => {
    expect(
      resolveViewerKind(
        att({
          mime_type:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        })
      )
    ).toBe('pptx-preview');
    expect(
      resolveViewerKind(att({ mime_type: 'application/vnd.ms-powerpoint' }))
    ).toBe('pptx-preview');
  });

  it('falls back to unsupported for unknown types', () => {
    expect(resolveViewerKind(att({ mime_type: 'application/x-7z-compressed' }))).toBe(
      'unsupported'
    );
  });

  it('treats URL attachments as unsupported (handled by external open)', () => {
    expect(
      resolveViewerKind(att({ source_type: 'url', mime_type: 'image/png' }))
    ).toBe('unsupported');
  });
});

describe('canViewInApp', () => {
  it('agrees with resolveViewerKind on the unsupported case', () => {
    const a = att({ mime_type: 'application/x-7z-compressed' });
    expect(canViewInApp(a)).toBe(false);
  });
  it('says yes for PDFs', () => {
    expect(canViewInApp(att({ mime_type: 'application/pdf' }))).toBe(true);
  });
});

describe('shortHash', () => {
  it('elides middle of long hashes', () => {
    const h =
      'abc1234567890def1234567890fedcba1234567890abcdef1234567890ab';
    expect(shortHash(h)).toBe('abc123…90ab');
  });
  it('returns short hashes verbatim', () => {
    expect(shortHash('abc')).toBe('abc');
    expect(shortHash('')).toBe('');
    expect(shortHash(undefined)).toBe('');
  });
});

describe('formatDuration', () => {
  it('formats minutes:seconds for short clips', () => {
    expect(formatDuration(7)).toBe('0:07');
    expect(formatDuration(125)).toBe('2:05');
  });
  it('formats hours:minutes:seconds for long clips', () => {
    expect(formatDuration(3725)).toBe('1:02:05');
  });
  it('returns empty for invalid input', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(undefined)).toBe('');
    expect(formatDuration(NaN)).toBe('');
  });
});

describe('thumbnailSrc', () => {
  it('prefers the server-generated thumb url', () => {
    const a = att({
      mime_type: 'image/png',
      thumb_url: '/api/attachments/a1/thumb',
      download_url: '/api/attachments/a1/download',
    });
    expect(thumbnailSrc(a)).toBe('/api/attachments/a1/thumb');
  });
  it('falls back to original image for image attachments', () => {
    const a = att({
      mime_type: 'image/png',
      thumb_url: null,
      download_url: '/api/attachments/a1/download',
    });
    expect(thumbnailSrc(a)).toBe('/api/attachments/a1/download');
  });
  it('returns null for non-image attachments without a thumb', () => {
    const a = att({ mime_type: 'application/pdf', download_url: 'x' });
    expect(thumbnailSrc(a)).toBe(null);
  });
  it('hides thumbs for blocked attachments', () => {
    const a = att({
      mime_type: 'image/png',
      scan_status: 'blocked',
      thumb_url: '/api/attachments/a1/thumb',
    });
    expect(thumbnailSrc(a)).toBe(null);
  });
});
