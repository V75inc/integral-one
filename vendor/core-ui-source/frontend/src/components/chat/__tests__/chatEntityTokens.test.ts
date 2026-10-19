import { describe, expect, it } from 'vitest';

import {
  findTagSegments,
  hrefForEntityRef,
  refAppearsInText,
  tokenTextForRef,
} from '../chatEntityTokens';
import type { ChatEntityRef } from '../../../types/chatEntityRefs';

describe('chatEntityTokens', () => {
  it('builds tokens with spaces preserved', () => {
    const ref: ChatEntityRef = {
      kind: 'user',
      id: 'n.User.1',
      label: 'Jason Smith',
    };
    expect(tokenTextForRef(ref)).toBe('@Jason Smith');
    expect(refAppearsInText('ping @Jason Smith ok', ref)).toBe(true);
    expect(refAppearsInText('ping @Jason_Smith ok', ref)).toBe(false);
  });

  it('finds multi-word ref segments via exact token', () => {
    const refs: ChatEntityRef[] = [
      {
        kind: 'user',
        id: 'u1',
        label: 'Jason Smith',
        token: '@Jason Smith',
      },
      { kind: 'app', id: 'a1', label: 'Fleet Ops', token: '#Fleet Ops' },
    ];
    const text = 'ask @Jason Smith about #Fleet Ops';
    const segs = findTagSegments(text, refs);
    expect(segs).toHaveLength(2);
    expect(segs[0]?.text).toBe('@Jason Smith');
    expect(segs[1]?.text).toBe('#Fleet Ops');
    expect(segs[1]?.ref?.kind).toBe('app');
  });

  it('scans multi-word # tags without refs (3+ words and punctuation)', () => {
    const text = 'see #Sprint Planning Board today';
    const segs = findTagSegments(text, []);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.text).toBe('#Sprint Planning Board');

    const textWithSpecial = 'check #Contracts & Legal now';
    const segsSpecial = findTagSegments(textWithSpecial, []);
    expect(segsSpecial).toHaveLength(1);
    expect(segsSpecial[0]?.text).toBe('#Contracts & Legal');
  });

  it('preserves multi-word entity ref with spaces when matching exact needle', () => {
    const refs: ChatEntityRef[] = [
      {
        kind: 'app',
        id: 'app-inv',
        label: 'Inventory Management',
        token: '#Inventory Management',
      },
    ];
    const text = 'update #Inventory Management right now';
    const segs = findTagSegments(text, refs);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.text).toBe('#Inventory Management');
    expect(segs[0]?.ref?.id).toBe('app-inv');
    expect(segs[0]?.ref?.kind).toBe('app');
  });

  it('attaches ref to free segment when token matches', () => {
    const refs: ChatEntityRef[] = [
      { kind: 'track', id: 't1', label: 'My Track', token: '#My Track' },
    ];
    const text = 'open #My Track now';
    const segs = findTagSegments(text, refs);
    expect(segs[0]?.ref?.id).toBe('t1');
  });

  it('hrefForEntityRef maps kinds to routes', () => {
    expect(hrefForEntityRef({ kind: 'app', id: 'n.App.1', label: 'X' })).toBe(
      '/apps/n.App.1',
    );
    expect(hrefForEntityRef({ kind: 'track', id: 'n.Track.1', label: 'Y' })).toBe(
      '/tracks/n.Track.1',
    );
    expect(
      hrefForEntityRef({ kind: 'user', id: 'n.User.1', label: 'Z' }, 'ws-1'),
    ).toBe('/workspaces/ws-1/members');
  });
});
