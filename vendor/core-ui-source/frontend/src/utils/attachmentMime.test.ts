import { describe, expect, it } from 'vitest';

import {
  attachmentFormatLabel,
  formatAttachmentSize,
  getAttachmentKind,
  isImageAttachment,
  shouldOpenAttachmentInNewTab,
} from './attachmentMime';

describe('attachmentMime', () => {
  it('maps mime type to attachment kind', () => {
    expect(getAttachmentKind({ mime_type: 'image/png', filename: 'x.png' })).toBe('image');
    expect(getAttachmentKind({ mime_type: 'application/pdf', filename: 'x.pdf' })).toBe('pdf');
    expect(getAttachmentKind({ mime_type: 'audio/mpeg', filename: 'x.mp3' })).toBe('audio');
  });

  it('falls back to filename extension when mime missing', () => {
    expect(getAttachmentKind({ filename: 'sheet.xlsx' })).toBe('sheet');
    expect(getAttachmentKind({ filename: 'archive.zip' })).toBe('archive');
    expect(getAttachmentKind({ filename: 'unknown.bin' })).toBe('other');
  });

  it('reports preview/open behavior flags', () => {
    expect(isImageAttachment({ mime_type: 'image/jpeg' })).toBe(true);
    expect(shouldOpenAttachmentInNewTab({ mime_type: 'video/mp4' })).toBe(true);
    expect(shouldOpenAttachmentInNewTab({ mime_type: 'application/octet-stream' })).toBe(false);
  });

  it('formats attachment sizes', () => {
    expect(formatAttachmentSize(512)).toBe('1 KB');
    expect(formatAttachmentSize(2048)).toBe('2 KB');
    expect(formatAttachmentSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});


describe('attachmentFormatLabel', () => {
  it('prefers the filename extension — it is what the OS will open', () => {
    expect(
      attachmentFormatLabel({ filename: 'spec.PNG', mime_type: 'image/png' })
    ).toBe('PNG');
    expect(
      attachmentFormatLabel({ filename: 'report.pdf', mime_type: 'application/pdf' })
    ).toBe('PDF');
  });

  it('falls back to the mime when the file has no extension', () => {
    expect(attachmentFormatLabel({ filename: 'scan', mime_type: 'image/webp' })).toBe(
      'WEBP'
    );
  });

  it('does not mistake a dotted filename for a format', () => {
    // "report.final version" — the tail is prose, not an extension.
    expect(
      attachmentFormatLabel({
        filename: 'report.final version',
        mime_type: 'application/pdf',
      })
    ).toBe('PDF');
  });

  it('maps the office mime soup to what people call the files', () => {
    expect(
      attachmentFormatLabel({
        filename: 'budget',
        mime_type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    ).toBe('XLSX');
  });

  it('strips structured-syntax suffixes and parameters', () => {
    expect(attachmentFormatLabel({ filename: 'logo', mime_type: 'image/svg+xml' })).toBe(
      'SVG'
    );
  });

  it('labels link attachments as links, not by mime', () => {
    expect(
      attachmentFormatLabel({
        filename: 'Docs',
        source_type: 'url',
        mime_type: 'text/html',
      })
    ).toBe('LINK');
  });

  it('returns nothing rather than a junk chip when the type is unknown', () => {
    expect(attachmentFormatLabel({ filename: 'mystery' })).toBe('');
  });
});
