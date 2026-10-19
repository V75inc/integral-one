import { describe, expect, it } from 'vitest';
import { diffBodyWithoutSummary } from '../diffBodyWithoutSummary';

describe('diffBodyWithoutSummary', () => {
  it('strips a leading summary line duplicated into the body', () => {
    const summary =
      'Set up Car Rental Manager app with cars, renters, rental status, and service/document reminders.';
    const body = `${summary}\n- Author library Operational Model "Car Rental Manager"`;
    expect(diffBodyWithoutSummary(summary, body)).toBe(
      '- Author library Operational Model "Car Rental Manager"',
    );
  });

  it('returns empty when body is only the summary', () => {
    expect(diffBodyWithoutSummary('Hello', 'Hello')).toBe('');
  });

  it('leaves unrelated body alone', () => {
    expect(diffBodyWithoutSummary('Title', '- step one')).toBe('- step one');
  });

  it('removes only the exact Core resource heading, preserving field detail', () => {
    expect(diffBodyWithoutSummary('Update entry “Kitchen_tap”', '**Update entry** *Kitchen_tap*\r\n\r\n- cost: 26000'))
      .toBe('- cost: 26000');
    expect(diffBodyWithoutSummary('Update entry "Kitchen_tap"', '**Update entry** *Kitchen_tap*')).toBe('');
    expect(diffBodyWithoutSummary('Create entry “The Hobbit” in Loans', '**Create entry** *The Hobbit*\n\n- Track: Loans'))
      .toBe('- Track: Loans');
    expect(diffBodyWithoutSummary('Publish profile draft Loans', '**Publish profile draft** `Loans`\n\nSwap the approved draft.'))
      .toBe('Swap the approved draft.');
    expect(diffBodyWithoutSummary('Update entry “Kitchen_tap”', '**Update entry** *Kitchen_tap_other*\n- cost: 26000'))
      .toBe('**Update entry** *Kitchen_tap_other*\n- cost: 26000');
  });

  it('does not strip when title is only a same-line prefix', () => {
    expect(diffBodyWithoutSummary('Create track', 'Create track Clients')).toBe(
      'Create track Clients',
    );
  });

  it('strips attach-image bodies that differ only by markdown backticks', () => {
    const summary =
      'Attach uploaded image pasted-image-ffd4a39f.jpeg to entry Queued App Deletion';
    const body =
      'Attach uploaded image `pasted-image-ffd4a39f.jpeg` to entry `Queued App Deletion`';
    expect(diffBodyWithoutSummary(summary, body)).toBe('');
  });
});
