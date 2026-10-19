/**
 * Human-readable cron helpers for Background Tasks.
 * Covers common 5-field patterns; falls back to a short custom label.
 */

export type SchedulePresetId =
  | 'every_minute'
  | 'every_2_minutes'
  | 'hourly'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'custom';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatClock(hour: number, minute: number): string {
  const h12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h12}:${pad2(minute)} ${ampm}`;
}

/** Describe a 5-field cron in plain English when possible. */
export function describeCron(cron: string, timezone?: string): string {
  if (!cron.trim()) {
    return 'One-shot';
  }
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return cron.trim() || 'Custom schedule';
  }
  const [minute, hour, dom, month, dow] = parts;
  const tz = timezone?.trim();
  const withTz = (label: string) => (tz ? `${label} (${tz})` : label);

  if (minute === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return withTz('Every minute');
  }
  if (/^\*\/\d+$/.test(minute) && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const n = minute.slice(2);
    return withTz(`Every ${n} minutes`);
  }
  if (cron.trim() === '0 * * * *') {
    return withTz('Every hour');
  }
  if (
    minute !== '*' &&
    hour === '*' &&
    dom === '*' &&
    month === '*' &&
    dow === '*' &&
    /^\d+$/.test(minute)
  ) {
    return withTz(`Every hour at :${pad2(Number(minute))}`);
  }
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dom === '*' &&
    month === '*' &&
    dow === '*'
  ) {
    return withTz(`Every day at ${formatClock(Number(hour), Number(minute))}`);
  }
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dom === '*' &&
    month === '*' &&
    (dow === '1-5' || dow === 'MON-FRI')
  ) {
    return withTz(
      `Weekdays at ${formatClock(Number(hour), Number(minute))}`,
    );
  }
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dom === '*' &&
    month === '*' &&
    /^\d+$/.test(dow)
  ) {
    const day = DAY_NAMES[Number(dow)] ?? `day ${dow}`;
    return withTz(
      `Every ${day} at ${formatClock(Number(hour), Number(minute))}`,
    );
  }
  return withTz(`Custom: ${cron.trim()}`);
}

export function detectSchedulePreset(cron: string): SchedulePresetId {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return 'custom';
  const [minute, hour, dom, month, dow] = parts;
  if (cron.trim() === '* * * * *') return 'every_minute';
  if (cron.trim() === '*/2 * * * *') return 'every_2_minutes';
  if (cron.trim() === '0 * * * *') return 'hourly';
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dom === '*' &&
    month === '*' &&
    dow === '*'
  ) {
    return 'daily';
  }
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dom === '*' &&
    month === '*' &&
    (dow === '1-5' || dow === 'MON-FRI')
  ) {
    return 'weekdays';
  }
  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dom === '*' &&
    month === '*' &&
    /^\d+$/.test(dow)
  ) {
    return 'weekly';
  }
  return 'custom';
}

export function parseCronTime(cron: string): { hour: number; minute: number } {
  const parts = cron.trim().split(/\s+/);
  if (parts.length === 5 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    return { hour: Number(parts[1]), minute: Number(parts[0]) };
  }
  return { hour: 9, minute: 0 };
}

export function parseCronWeekday(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  if (parts.length === 5 && /^\d+$/.test(parts[4])) {
    return Number(parts[4]);
  }
  return 1;
}

export function buildCronFromPreset(
  preset: SchedulePresetId,
  opts: { hour: number; minute: number; weekday: number; customCron: string },
): string {
  const h = Math.min(23, Math.max(0, opts.hour));
  const m = Math.min(59, Math.max(0, opts.minute));
  const d = Math.min(6, Math.max(0, opts.weekday));
  switch (preset) {
    case 'every_minute':
      return '* * * * *';
    case 'every_2_minutes':
      return '*/2 * * * *';
    case 'hourly':
      return '0 * * * *';
    case 'daily':
      return `${m} ${h} * * *`;
    case 'weekdays':
      return `${m} ${h} * * 1-5`;
    case 'weekly':
      return `${m} ${h} * * ${d}`;
    case 'custom':
    default:
      return opts.customCron.trim() || '0 9 * * *';
  }
}

export const SCHEDULE_PRESET_OPTIONS: Array<{
  id: SchedulePresetId;
  label: string;
}> = [
  { id: 'every_minute', label: 'Every minute' },
  { id: 'every_2_minutes', label: 'Every 2 minutes' },
  { id: 'hourly', label: 'Every hour' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'custom', label: 'Custom (advanced)' },
];
