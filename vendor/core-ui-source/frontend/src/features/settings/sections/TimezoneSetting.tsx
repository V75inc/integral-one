import { useEffect, useState } from 'react';
import { userTimezoneApi } from '../../../api/userTimezone';
import { errorMessageFromAxios } from '../../../api/helpers';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { Input } from '../../../ui';
import { Button } from '../../../components/ui';
import { Field, Section } from '../../../patterns';
import { browserTimezone } from '../../../utils/userTimezone';

export function TimezoneSetting() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [timezone, setTimezone] = useState(user?.timezone || browserTimezone());
  const [saving, setSaving] = useState(false);
  useEffect(() => { setTimezone(user?.timezone || browserTimezone()); }, [user?.timezone]);
  const detected = browserTimezone();
  // Text input + native suggestions also supports browsers without supportedValuesOf.
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf?.('timeZone') || [detected];

  async function save() {
    setSaving(true);
    try {
      await userTimezoneApi.set(timezone.trim());
      await refreshUser();
      showToast('Time zone saved.', 'success');
    } catch (err) {
      showToast(errorMessageFromAxios(err, 'Could not save time zone.'), 'error');
    } finally { setSaving(false); }
  }

  return (
    <Section title="Time zone" description="Used for local dates and new reminders and schedules. Existing schedules keep their saved time zone.">
      <Field label="Account time zone" htmlFor="account-timezone" hint={`Detected on this device: ${detected}`}>
        <Input id="account-timezone" list="account-timezones" disabled={saving} value={timezone} onChange={e => setTimezone(e.target.value)} />
      </Field>
      <datalist id="account-timezones">
        {Array.from(new Set(['UTC', detected, ...zones])).map(zone => <option key={zone} value={zone} />)}
      </datalist>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={saving} onClick={() => setTimezone(detected)}>Use device time zone</Button>
        <Button variant="primary" size="sm" loading={saving} disabled={saving || !timezone.trim() || timezone.trim() === user?.timezone} onClick={() => void save()}>Save time zone</Button>
      </div>
    </Section>
  );
}
