import { describe, it, expect } from 'vitest';
import { assertPdfBlob } from '../pdfjsLoader';

describe('assertPdfBlob', () => {
  it('accepts a PDF magic header', async () => {
    const blob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
    const out = await assertPdfBlob(blob);
    expect(out.type).toBe('application/pdf');
    expect(out.size).toBeGreaterThan(0);
  });

  it('surfaces API JSON errors', async () => {
    const blob = new Blob(
      [JSON.stringify({ message: 'Contract review is not enabled' })],
      { type: 'application/json' },
    );
    await expect(assertPdfBlob(blob)).rejects.toThrow(
      'Contract review is not enabled',
    );
  });
});
