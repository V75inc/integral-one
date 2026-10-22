import { describe, expect, it } from 'vitest';
import { buildCommentForest, mergeComments } from './commentTree';
import type { Comment } from '../types';
const root: Comment = { id: 'root', text: 'a', author_id: 'u', entry_id: 'e', created_at: '2026-10-21' };
const reply: Comment = { ...root, id: 'reply', parent_id: 'root' };
describe('canonical comment identity', () => {
  it('keeps one row and the latest canonical representation per comment', () => {
    expect(mergeComments([root], [{ ...root, text: 'edited' }])).toEqual([{ ...root, text: 'edited' }]);
    const forest = buildCommentForest([root, root, reply, reply]);
    expect(forest).toHaveLength(1);
    expect(forest[0].children).toHaveLength(1);
  });
});
