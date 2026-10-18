import { describe, expect, it } from 'vitest';
import {
  buildBaseSlotPlaceholder,
  buildFieldPlaceholder,
  labelAsPhraseFragment,
  normalizeExplicitPlaceholder,
} from './fieldPlaceholders';
import type { OperationalModelFieldSpec } from '../types';

describe('labelAsPhraseFragment', () => {
  it('preserves casing of the first character', () => {
    expect(labelAsPhraseFragment('Contact name')).toBe('Contact name');
  });
});

describe('normalizeExplicitPlaceholder', () => {
  it('prefixes bare phrases', () => {
    expect(normalizeExplicitPlaceholder('Contact name', 'Enter')).toBe('Enter Contact name');
  });

  it('leaves already-guided placeholders', () => {
    expect(normalizeExplicitPlaceholder('Enter email', 'Enter')).toBe('Enter email');
    expect(normalizeExplicitPlaceholder('Choose stage', 'Choose')).toBe('Choose stage');
    expect(normalizeExplicitPlaceholder('Describe this entry', 'Enter')).toBe('Describe this entry');
  });
});

describe('buildBaseSlotPlaceholder', () => {
  it('normalizes manifest title/body placeholders', () => {
    expect(
      buildBaseSlotPlaceholder({
        label: 'Name',
        placeholder: 'Contact name',
        canonicalLabel: 'Title',
        slot: 'title',
      })
    ).toBe('Enter Contact name');

    expect(
      buildBaseSlotPlaceholder({
        label: 'Notes',
        placeholder: 'Notes about this contact',
        canonicalLabel: 'Body',
        slot: 'body',
      })
    ).toBe('Enter Notes about this contact');
  });

  it('uses defaults for canonical labels', () => {
    expect(
      buildBaseSlotPlaceholder({
        label: 'Title',
        placeholder: '',
        canonicalLabel: 'Title',
        slot: 'title',
      })
    ).toBe('Enter title (optional)');

    expect(
      buildBaseSlotPlaceholder({
        label: 'Body',
        placeholder: '',
        canonicalLabel: 'Body',
        slot: 'body',
      })
    ).toBe('Enter details');
  });

  it('derives from custom label when placeholder omitted', () => {
    expect(
      buildBaseSlotPlaceholder({
        label: 'Headline',
        placeholder: '',
        canonicalLabel: 'Title',
        slot: 'title',
      })
    ).toBe('Enter Headline');
  });
});

describe('buildFieldPlaceholder', () => {
  it('uses manifest placeholder normalized with Enter', () => {
    const field = {
      key: 'x',
      name: 'Stage',
      type: 'select',
      placeholder: 'Stage',
    } as OperationalModelFieldSpec;
    expect(buildFieldPlaceholder(field)).toBe('Enter Stage');
  });

  it('generates by type when placeholder empty', () => {
    expect(
      buildFieldPlaceholder({
        key: 'n',
        name: 'Budget',
        type: 'number',
      } as OperationalModelFieldSpec)
    ).toBe('Enter Budget (e.g., 42)');

    expect(
      buildFieldPlaceholder({
        key: 'm',
        name: 'Notes',
        type: 'markdown',
      } as OperationalModelFieldSpec)
    ).toBe('Enter Notes (Markdown supported)');
  });

  it('respects explicit guided placeholders', () => {
    expect(
      buildFieldPlaceholder({
        key: 's',
        name: 'Source',
        type: 'text',
        placeholder: 'Enter source',
      } as OperationalModelFieldSpec)
    ).toBe('Enter source');
  });
});
