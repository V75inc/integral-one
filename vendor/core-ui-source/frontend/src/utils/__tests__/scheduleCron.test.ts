import { describe, expect, it } from 'vitest';
import {
  buildCronFromPreset,
  describeCron,
  detectSchedulePreset,
} from '../scheduleCron';

describe('scheduleCron', () => {
  it('describes common presets in plain English', () => {
    expect(describeCron('* * * * *')).toBe('Every minute');
    expect(describeCron('*/2 * * * *')).toBe('Every 2 minutes');
    expect(describeCron('0 * * * *', 'UTC')).toBe('Every hour (UTC)');
    expect(describeCron('0 9 * * *', 'America/New_York')).toBe(
      'Every day at 9:00 AM (America/New_York)',
    );
    expect(describeCron('30 14 * * 1-5')).toBe('Weekdays at 2:30 PM');
  });

  it('round-trips preset builders', () => {
    expect(
      buildCronFromPreset('daily', {
        hour: 9,
        minute: 0,
        weekday: 1,
        customCron: '',
      }),
    ).toBe('0 9 * * *');
    expect(detectSchedulePreset('0 9 * * 1-5')).toBe('weekdays');
  });
});
