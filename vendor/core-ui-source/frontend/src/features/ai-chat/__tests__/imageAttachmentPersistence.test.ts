import { describe, it, expect } from 'vitest';
import type { ThreadMessageLike } from '@assistant-ui/react';
import {
  normalizePersistedParts,
  persistedAssistantErrorMessage,
  mergeColdTranscript,
} from '../useAIChatRuntime';

describe('normalizePersistedParts', () => {
  it('folds historical tool updates without losing arguments, result or ordering', () => {
    const parts = normalizePersistedParts([
      { type: 'tool-call', toolCallId: 'a', toolName: 'read', args: { file: 'file1' }, status: 'running' },
      { type: 'text', text: 'Partial answer' },
      { type: 'tool-call', toolCallId: 'b', toolName: 'list', status: 'running' },
      { type: 'tool-call', toolCallId: 'a', toolName: 'read', result: 'read receipt', status: 'complete', isError: false },
      { type: 'tool-call', toolCallId: 'b', toolName: 'list', status: 'error', isError: true },
    ] as any);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatchObject({ toolCallId: 'a', args: { file: 'file1' }, result: 'read receipt', status: 'complete' });
    expect(parts[1]).toEqual({ type: 'text', text: 'Partial answer' });
    expect(parts[2]).toMatchObject({ toolCallId: 'b', status: 'error', isError: true });
  });

  it('reconstructs image data URL from persisted data and content_type', () => {
    const rawParts = [
      { type: 'text', text: 'Check out this photo' },
      {
        type: 'image',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        content_type: 'image/png',
        image_id: 'img-123',
      },
    ];

    const normalized = normalizePersistedParts(rawParts as any);
    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toEqual({ type: 'text', text: 'Check out this photo' });

    const imgPart = normalized[1] as Record<string, unknown>;
    expect(imgPart.type).toBe('image');
    expect(imgPart.image).toBe(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    );
    expect(imgPart.image_id).toBe('img-123');
  });

  it('preserves existing data URLs in data or image', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...';
    const rawParts = [
      {
        type: 'image',
        data: dataUrl,
        content_type: 'image/jpeg',
      },
    ];

    const normalized = normalizePersistedParts(rawParts as any);
    const imgPart = normalized[0] as Record<string, unknown>;
    expect(imgPart.image).toBe(dataUrl);
  });

  it('leaves file parts and text parts unchanged', () => {
    const rawParts = [
      { type: 'text', text: 'file attached' },
      {
        type: 'file',
        filename: 'invoice.pdf',
        mimeType: 'application/pdf',
        attachment_id: 'att-1',
      },
    ];

    const normalized = normalizePersistedParts(rawParts as any);
    expect(normalized).toEqual(rawParts);
  });

  it('strips persisted assistant error parts so hydrate does not crash', () => {
    const normalized = normalizePersistedParts([
      { type: 'text', text: 'Partial answer.' },
      {
        type: 'error',
        code: 'approved_build_not_applied',
        message: 'The approved App design has not been built yet.',
      },
    ] as any);

    expect(normalized).toEqual([{ type: 'text', text: 'Partial answer.' }]);
  });

  it('uses a safe fallback for persisted errors without a message', () => {
    expect(
      persistedAssistantErrorMessage([{ type: 'error', code: 'unknown' }] as any),
    ).toBe('The assistant could not complete this step.');
  });

  it('reads the first persisted error message for MessageError status', () => {
    expect(
      persistedAssistantErrorMessage([
        {
          type: 'error',
          code: 'design_proposal_missing',
          message: "I couldn't save the app design. Please try the request again.",
        },
      ] as any),
    ).toBe("I couldn't save the app design. Please try the request again.");
  });
});

describe('mergeColdTranscript attachment preservation', () => {
  it('preserves local attachments when server record is reconciled', () => {
    const localUserMsg: ThreadMessageLike = {
      id: 'local-u-1',
      role: 'user',
      content: [
        { type: 'text', text: 'hello' },
        {
          type: 'image',
          image: 'data:image/png;base64,abc',
        } as any,
      ],
    };

    const serverUserMsg: ThreadMessageLike = {
      id: 'server-u-1',
      role: 'user',
      content: [{ type: 'text', text: 'hello' }],
    };

    const merged = mergeColdTranscript([serverUserMsg], [localUserMsg]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('local-u-1');
    // Local image attachment should have been preserved
    const contents = merged[0].content as any[];
    expect(contents.some(p => p.type === 'image')).toBe(true);
  });
});
