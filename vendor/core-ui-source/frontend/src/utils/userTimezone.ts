/** IANA account time zones; never infer UTC offsets from the server clock. */
export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function formatUserDateTime(
  value: string | Date,
  timezone = 'UTC',
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short', ...options, timeZone: timezone,
  }).format(new Date(value));
}
