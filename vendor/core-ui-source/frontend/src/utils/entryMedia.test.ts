import { describe, expect, it } from 'vitest';
import {
  allImageAttachmentsFromAttachments,
  attachmentImageDisplayUrl,
  attachmentIdForDisplayUrl,
  CARD_PREVIEW_ATTACHMENT_FIELD,
  firstImageAttachmentFromAttachments,
  firstImageUrlFromAttachments,
  urlNeedsAuthFetch,
} from './entryMedia';
import type { Attachment } from '../types';

describe('firstImageUrlFromAttachments', () => {
  it('returns first URL attachment with image-like path', () => {
    const attachments: Attachment[] = [
      {
        id: '1',
        filename: 'doc',
        source_type: 'url',
        external_url: 'https://x.com/page',
      },
      {
        id: '2',
        filename: 'pic',
        source_type: 'url',
        external_url: 'https://cdn.example.com/a.png',
      },
    ];
    expect(firstImageUrlFromAttachments(attachments)).toBe(
      'https://cdn.example.com/a.png'
    );
  });

  it('returns null when no image-like URL attachments', () => {
    expect(
      firstImageUrlFromAttachments([
        {
          id: '1',
          filename: 'x',
          source_type: 'url',
          external_url: 'https://example.com/page',
        },
      ])
    ).toBeNull();
  });
});

describe('attachmentImageDisplayUrl', () => {
  it('prefers thumb_url for file image attachments', () => {
    expect(
      attachmentImageDisplayUrl({
        id: 'a1',
        filename: 'photo.png',
        source_type: 'file',
        mime_type: 'image/png',
        thumb_url: '/api/attachments/a1/thumb',
        download_url: '/api/attachments/a1/download',
      })
    ).toBe('/api/attachments/a1/thumb');
  });

  it('synthesizes thumb path when thumb_storage_key is set', () => {
    expect(
      attachmentImageDisplayUrl({
        id: 'a2',
        filename: 'photo.jpg',
        source_type: 'file',
        mime_type: 'image/jpeg',
        thumb_storage_key: 'attachments/a2_thumb.jpg',
      })
    ).toBe('/api/attachments/a2/thumb');
  });

  it('treats storage_key uploads as file images without explicit source_type', () => {
    expect(
      attachmentImageDisplayUrl({
        id: 'a3b',
        filename: 'photo.png',
        mime_type: 'image/png',
        storage_key: 'attachments/a3b.png',
      })
    ).toBe('/api/attachments/a3b/download');
  });

  it('falls back to download path for file images without thumb', () => {
    expect(
      attachmentImageDisplayUrl({
        id: 'a3',
        filename: 'photo.gif',
        source_type: 'file',
        mime_type: 'image/gif',
      })
    ).toBe('/api/attachments/a3/download');
  });

  it('skips blocked file attachments', () => {
    expect(
      attachmentImageDisplayUrl({
        id: 'a4',
        filename: 'bad.png',
        source_type: 'file',
        mime_type: 'image/png',
        scan_status: 'blocked',
      })
    ).toBeNull();
  });

  it('ignores non-image file attachments', () => {
    expect(
      attachmentImageDisplayUrl({
        id: 'a5',
        filename: 'doc.pdf',
        source_type: 'file',
        mime_type: 'application/pdf',
      })
    ).toBeNull();
  });
});

describe('firstImageAttachmentFromAttachments', () => {
  it('returns first image attachment in list order', () => {
    const result = firstImageAttachmentFromAttachments([
      {
        id: 'u1',
        filename: 'link',
        source_type: 'url',
        external_url: 'https://cdn.example.com/hero.webp',
      },
      {
        id: 'f1',
        filename: 'upload.png',
        source_type: 'file',
        mime_type: 'image/png',
      },
    ]);
    expect(result).toEqual({
      url: 'https://cdn.example.com/hero.webp',
      attachmentId: 'u1',
      needsAuth: false,
    });
  });

  it('returns file image with needsAuth for api paths', () => {
    const result = firstImageAttachmentFromAttachments([
      {
        id: 'f1',
        filename: 'upload.png',
        source_type: 'file',
        mime_type: 'image/png',
        thumb_url: '/api/attachments/f1/thumb',
      },
    ]);
    expect(result).toEqual({
      url: '/api/attachments/f1/thumb',
      attachmentId: 'f1',
      needsAuth: true,
    });
  });

  it('skips blocked files and returns the next image', () => {
    const result = firstImageAttachmentFromAttachments([
      {
        id: 'b1',
        filename: 'blocked.png',
        source_type: 'file',
        mime_type: 'image/png',
        scan_status: 'blocked',
      },
      {
        id: 'f2',
        filename: 'ok.png',
        source_type: 'file',
        mime_type: 'image/png',
        download_url: '/api/attachments/f2/download',
      },
    ]);
    expect(result?.url).toBe('/api/attachments/f2/download');
    expect(result?.attachmentId).toBe('f2');
  });

  it('prefers _card_preview_attachment_id when set', () => {
    const attachments: Attachment[] = [
      {
        id: 'first',
        filename: 'a.png',
        source_type: 'file',
        mime_type: 'image/png',
        download_url: '/api/attachments/first/download',
      },
      {
        id: 'second',
        filename: 'b.png',
        source_type: 'file',
        mime_type: 'image/png',
        download_url: '/api/attachments/second/download',
      },
    ];
    const result = firstImageAttachmentFromAttachments(attachments, {
      [CARD_PREVIEW_ATTACHMENT_FIELD]: 'second',
    });
    expect(result?.attachmentId).toBe('second');
    expect(result?.url).toBe('/api/attachments/second/download');
  });

  it('falls back when card preview id is missing or invalid', () => {
    const attachments: Attachment[] = [
      {
        id: 'first',
        filename: 'a.png',
        source_type: 'file',
        mime_type: 'image/png',
        download_url: '/api/attachments/first/download',
      },
    ];
    expect(
      firstImageAttachmentFromAttachments(attachments, {
        [CARD_PREVIEW_ATTACHMENT_FIELD]: 'gone',
      })?.attachmentId
    ).toBe('first');
  });
});

describe('allImageAttachmentsFromAttachments', () => {
  it('returns all image attachments in list order', () => {
    const attachments: Attachment[] = [
      {
        id: 'doc',
        filename: 'doc.pdf',
        source_type: 'file',
        mime_type: 'application/pdf',
      },
      {
        id: 'a',
        filename: 'a.png',
        source_type: 'file',
        mime_type: 'image/png',
        download_url: '/api/attachments/a/download',
      },
      {
        id: 'b',
        filename: 'b.jpg',
        source_type: 'file',
        mime_type: 'image/jpeg',
        download_url: '/api/attachments/b/download',
      },
    ];
    expect(allImageAttachmentsFromAttachments(attachments)).toEqual([
      {
        url: '/api/attachments/a/download',
        attachmentId: 'a',
        needsAuth: true,
      },
      {
        url: '/api/attachments/b/download',
        attachmentId: 'b',
        needsAuth: true,
      },
    ]);
  });
});

describe('attachmentIdForDisplayUrl', () => {
  it('matches attachment by display url', () => {
    const attachments: Attachment[] = [
      {
        id: 'a1',
        filename: 'photo.png',
        source_type: 'file',
        mime_type: 'image/png',
        thumb_url: '/api/attachments/a1/thumb',
      },
    ];
    expect(attachmentIdForDisplayUrl(attachments, '/api/attachments/a1/thumb')).toBe(
      'a1'
    );
    expect(attachmentImageDisplayUrl(attachments[0])).toBe('/api/attachments/a1/thumb');
  });
});

describe('urlNeedsAuthFetch', () => {
  it('detects same-origin api paths', () => {
    expect(urlNeedsAuthFetch('/api/attachments/x/thumb')).toBe(true);
    expect(urlNeedsAuthFetch('https://cdn.example.com/a.png')).toBe(false);
  });
});
