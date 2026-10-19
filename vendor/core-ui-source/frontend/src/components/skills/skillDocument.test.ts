import { describe, expect, it } from 'vitest';

import { composeSkillDocument, parseSkillDocument, type SkillDocFields } from './skillDocument';

const EMPTY: SkillDocFields = { name: '', description: '', tools: [], body: '' };

describe('skillDocument', () => {
  it('round-trips fields through compose → parse', () => {
    const fields: SkillDocFields = {
      name: 'Report Filer',
      description: 'When the user files a report: notes, emails, summaries.',
      tools: ['integral_file_content', 'integral_query_entries'],
      body: '# Procedure\n\nDo the filing.',
    };
    const doc = composeSkillDocument(fields);
    expect(parseSkillDocument(doc, EMPTY)).toEqual(fields);
  });

  it('handles empty tools as an inline empty list', () => {
    const doc = composeSkillDocument({ ...EMPTY, name: 'X', body: 'hi' });
    expect(doc).toContain('allowed-tools: []');
    expect(parseSkillDocument(doc, EMPTY)).toEqual({
      name: 'X',
      description: '',
      tools: [],
      body: 'hi',
    });
  });

  it('parses a hand-edited frontmatter block', () => {
    const doc = [
      '---',
      'name: Custom',
      'description: "Edited by hand"',
      'allowed-tools:',
      '  - integral_file_content',
      '---',
      '',
      'Body text.',
    ].join('\n');
    expect(parseSkillDocument(doc, EMPTY)).toEqual({
      name: 'Custom',
      description: 'Edited by hand',
      tools: ['integral_file_content'],
      body: 'Body text.',
    });
  });

  it('preserves description with colons and quotes', () => {
    const fields: SkillDocFields = {
      name: 'n',
      description: 'Ground on: tracks, types. Say "hi".',
      tools: [],
      body: 'b',
    };
    expect(parseSkillDocument(composeSkillDocument(fields), EMPTY)).toEqual(fields);
  });

  it('falls back to body-only when there is no frontmatter', () => {
    const prev: SkillDocFields = { name: 'keep', description: 'keep', tools: ['t'], body: 'old' };
    expect(parseSkillDocument('just some markdown', prev)).toEqual({
      name: 'keep',
      description: 'keep',
      tools: ['t'],
      body: 'just some markdown',
    });
  });

  it('parses an inline allowed-tools list', () => {
    const doc = '---\nname: n\ndescription: d\nallowed-tools: [a, b]\n---\nbody';
    expect(parseSkillDocument(doc, EMPTY).tools).toEqual(['a', 'b']);
  });
});
