import { describe, expect, it } from 'vitest';

import { syncEntityRefsFromText } from '../syncEntityRefsFromText';
import type { ChatEntityRef } from '../../../types/chatEntityRefs';

describe('syncEntityRefsFromText', () => {
  it('keeps refs whose tokens remain in text', () => {
    const refs: ChatEntityRef[] = [
      { kind: 'app', id: 'n.App.1', label: 'CRM' },
      { kind: 'user', id: 'n.User.1', label: 'Jason Smith' },
    ];
    const text = 'check #CRM for @Jason Smith';
    const out = syncEntityRefsFromText(text, refs);
    expect(out).toHaveLength(2);
  });

  it('drops refs when token removed from text', () => {
    const refs: ChatEntityRef[] = [
      { kind: 'app', id: 'n.App.1', label: 'CRM' },
    ];
    const text = 'no tags here';
    const out = syncEntityRefsFromText(text, refs);
    expect(out).toHaveLength(0);
  });
});
