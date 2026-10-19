import { describe, expect, it } from 'vitest';
import {
  feedCardPrimaryNeedsExpand,
  findEntryTypeBySlug,
  formatCustomFieldValue,
  getDisallowedCustomFieldKeys,
  getMissingRequiredFields,
  isEmptyCustomFieldValue,
  resolveEntryProfileFields,
  shouldRenderMetaField,
  slugEntryTypeName,
  sortFieldsByOrder,
} from './entryMetaFields';
import type { OperationalModelEntryTypeLike } from './entryMetaFields';
import type { OperationalModelFieldSpec } from '../types';

describe('entryMetaFields', () => {
  it('slugEntryTypeName normalizes', () => {
    expect(slugEntryTypeName('Bug Report')).toBe('bug_report');
  });

  it('sortFieldsByOrder respects order then manifest index', () => {
    const fields = [
      { key: 'c', name: 'C', type: 'text', order: 2 },
      { key: 'a', name: 'A', type: 'text', order: 0 },
      { key: 'b', name: 'B', type: 'text', order: 1 },
    ] as OperationalModelFieldSpec[];
    expect(sortFieldsByOrder(fields).map(f => f.key)).toEqual(['a', 'b', 'c']);
    const legacy = [
      { key: 'first', name: 'First', type: 'text' },
      { key: 'second', name: 'Second', type: 'text' },
    ] as OperationalModelFieldSpec[];
    expect(sortFieldsByOrder(legacy).map(f => f.key)).toEqual(['first', 'second']);
  });

  it('isEmptyCustomFieldValue', () => {
    expect(isEmptyCustomFieldValue(null)).toBe(true);
    expect(isEmptyCustomFieldValue('')).toBe(true);
    expect(isEmptyCustomFieldValue('  ')).toBe(true);
    expect(isEmptyCustomFieldValue([])).toBe(true);
    expect(isEmptyCustomFieldValue(0)).toBe(false);
    expect(isEmptyCustomFieldValue(false)).toBe(false);
  });

  it('getDisallowedCustomFieldKeys flags keys outside schema and ignores system keys', () => {
    const fields = [
      { key: 'publish_date', name: 'Publish date', type: 'date' },
    ] as OperationalModelFieldSpec[];
    expect(
      getDisallowedCustomFieldKeys(fields, {
        publish_date: '2026-06-09',
        _entry_type_slug: 'contentpiece',
      })
    ).toEqual([]);
    expect(
      getDisallowedCustomFieldKeys([], { publish_date: '2026-06-09' })
    ).toEqual(['publish_date']);
  });

  it('getMissingRequiredFields lists only required fields without values', () => {
    const fields = [
      { key: 'member', name: 'Member', type: 'member', required: true },
      { key: 'start_date', name: 'Start', type: 'date' },
      { key: 'status', name: 'Status', type: 'select', required: true },
    ] as OperationalModelFieldSpec[];
    const missing = getMissingRequiredFields(fields, {
      start_date: '2026-06-08',
    });
    expect(missing.map(f => f.key)).toEqual(['member', 'status']);
  });

  it('formatCustomFieldValue boolean', () => {
    const f = { key: 'x', name: 'X', type: 'boolean' } as OperationalModelFieldSpec;
    expect(formatCustomFieldValue(f, true)).toBe('Yes');
    expect(formatCustomFieldValue(f, false)).toBe('No');
  });

  it('formatCustomFieldValue relation returns raw ids (RelationValue owns label resolution)', () => {
    const f = { key: 'r', name: 'R', type: 'relation' } as OperationalModelFieldSpec;
    expect(formatCustomFieldValue(f, 'id1')).toBe('id1');
    expect(formatCustomFieldValue(f, ['id1', 'id2'])).toBe('id1, id2');
    expect(formatCustomFieldValue(f, null)).toBe('');
    expect(formatCustomFieldValue(f, [])).toBe('');
  });

  it('formatCustomFieldValue member returns raw id (MemberValue owns label resolution)', () => {
    const f = { key: 'member', name: 'Member', type: 'member' } as OperationalModelFieldSpec;
    expect(formatCustomFieldValue(f, 'user-1')).toBe('user-1');
    expect(formatCustomFieldValue(f, null)).toBe('');
  });

  it('shouldRenderMetaField shows relations in both variants when value is non-empty', () => {
    const f = { key: 'r', name: 'R', type: 'relation' } as OperationalModelFieldSpec;
    // Both variants now render relations — <RelationValue> resolves ids on demand.
    expect(shouldRenderMetaField(f, 'e1', 'card')).toBe(true);
    expect(shouldRenderMetaField(f, 'e1', 'detail')).toBe(true);
    // Empty: cards stay compact; detail keeps the row so users can assign.
    expect(shouldRenderMetaField(f, null, 'card')).toBe(false);
    expect(shouldRenderMetaField(f, [], 'detail')).toBe(true);
  });

  it('shouldRenderMetaField shows member fields when value is non-empty', () => {
    const f = { key: 'member', name: 'Member', type: 'member' } as OperationalModelFieldSpec;
    expect(shouldRenderMetaField(f, 'user-1', 'card')).toBe(true);
    expect(shouldRenderMetaField(f, 'user-1', 'detail')).toBe(true);
    expect(shouldRenderMetaField(f, null, 'card')).toBe(false);
    expect(shouldRenderMetaField(f, null, 'detail')).toBe(true);
  });

  it('shouldRenderMetaField shows file/files rows on the detail even when empty', () => {
    const files = { key: 'media', name: 'Media', type: 'files' } as OperationalModelFieldSpec;
    expect(shouldRenderMetaField(files, ['att-1'], 'detail')).toBe(true);
    expect(shouldRenderMetaField(files, ['att-1'], 'card')).toBe(true);
    // Empty: the detail keeps the row (uploader when editable, "—" otherwise);
    // cards stay compact.
    expect(shouldRenderMetaField(files, [], 'detail')).toBe(true);
    expect(shouldRenderMetaField(files, [], 'card')).toBe(false);

    const single = { key: 'doc', name: 'Document', type: 'file' } as OperationalModelFieldSpec;
    expect(shouldRenderMetaField(single, null, 'detail')).toBe(true);
    expect(shouldRenderMetaField(single, null, 'card')).toBe(false);
  });

  it('resolveEntryProfileFields matches by manifest key, not display name', () => {
    const entryTypes = [
      {
        name: 'Contact',
        form_schema: {
          _manifest_entry_type_key: 'crm_contact',
          fields: [
            { key: 'organization', name: 'Organization', type: 'text' },
            { key: 'request', name: 'Request', type: 'text' },
          ],
        },
      },
    ] as unknown as OperationalModelEntryTypeLike[];
    // The bug: name "Contact" slugs to "contact" ≠ entry.type "crm_contact".
    expect(resolveEntryProfileFields(entryTypes, 'crm_contact').map(f => f.key)).toEqual([
      'organization',
      'request',
    ]);
  });

  it('resolveEntryProfileFields falls back to the display-name slug', () => {
    const entryTypes = [
      {
        name: 'Bug Report',
        form_schema: { fields: [{ key: 'a', name: 'A', type: 'text' }] },
      },
    ] as unknown as OperationalModelEntryTypeLike[];
    expect(resolveEntryProfileFields(entryTypes, 'bug_report').map(f => f.key)).toEqual([
      'a',
    ]);
  });

  it('resolveEntryProfileFields returns [] when nothing matches', () => {
    expect(resolveEntryProfileFields([], 'crm_contact')).toEqual([]);
  });

  it('findEntryTypeBySlug matches key, name, id, and single-type fallback', () => {
    const types = [
      {
        id: 'et1',
        name: 'Contact',
        form_schema: { _manifest_entry_type_key: 'crm_contact' },
      },
    ] as unknown as OperationalModelEntryTypeLike[];
    expect(findEntryTypeBySlug(types, 'crm_contact')).toBe(types[0]); // key
    expect(findEntryTypeBySlug(types, 'Contact')).toBe(types[0]); // name
    expect(findEntryTypeBySlug(types, 'et1')).toBe(types[0]); // id
    expect(findEntryTypeBySlug(types, 'whatever')).toBe(types[0]); // single-type fallback

    const twoTypes = [
      ...types,
      { id: 'et2', name: 'Other', form_schema: {} },
    ] as unknown as OperationalModelEntryTypeLike[];
    expect(findEntryTypeBySlug(twoTypes, 'whatever')).toBeNull();
    expect(findEntryTypeBySlug(twoTypes, '')).toBeNull();
  });

  it('shouldRenderMetaField honors hide_on_card (card hidden, detail shown)', () => {
    const hidden = {
      key: 'summary',
      name: 'Summary',
      type: 'text',
      hide_on_card: true,
    } as OperationalModelFieldSpec;
    expect(shouldRenderMetaField(hidden, 'some text', 'card')).toBe(false);
    expect(shouldRenderMetaField(hidden, 'some text', 'detail')).toBe(true);

    const normal = {
      key: 'note',
      name: 'Note',
      type: 'text',
    } as OperationalModelFieldSpec;
    expect(shouldRenderMetaField(normal, 'some text', 'card')).toBe(true);
  });

  it('feedCardPrimaryNeedsExpand for long body or meta', () => {
    const fields = [
      { key: 'note', name: 'Note', type: 'text' },
    ] as OperationalModelFieldSpec[];
    expect(
      feedCardPrimaryNeedsExpand({
        body: 'x'.repeat(201),
        fields,
        values: {},
      })
    ).toBe(true);
    expect(
      feedCardPrimaryNeedsExpand({
        body: 'short',
        title: 'y'.repeat(130),
        fields,
        values: {},
      })
    ).toBe(true);
    expect(
      feedCardPrimaryNeedsExpand({
        body: 'short',
        fields,
        values: { note: 'z'.repeat(120) },
      })
    ).toBe(true);
    expect(
      feedCardPrimaryNeedsExpand({
        body: 'short',
        fields,
        values: { note: 'hi' },
      })
    ).toBe(false);
  });
});
