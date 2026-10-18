import { useEffect, useId, useRef, useState } from 'react';
import { APP_ICONS, AppIcon, Text } from '../../ui';
import { Button } from '../ui';

export function AppIconPicker({ name, value, onChange, onProcessing }: {
  name: string;
  value: string;
  onChange(value: string): void;
  onProcessing?(busy: boolean): void;
}) {
  const id = useId();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a PNG, JPEG or WebP image smaller than 5 MB.');
      return;
    }
    setLoading(true);
    onProcessing?.(true);
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image processing unavailable');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const logo = canvas.toDataURL('image/png');
        if (logo.length > 174800) throw new Error('Image too complex');
        if (active.current) onChange(logo);
      } finally { bitmap.close(); }
    } catch {
      setError('This image could not be used. Try a smaller or simpler logo.');
    } finally { setLoading(false); onProcessing?.(false); }
  }
  return (
    <fieldset className="space-y-3">
      <legend><Text variant="label">App icon or logo</Text></legend>
      <div className="flex flex-wrap items-center gap-3">
        <AppIcon name={name || 'App'} icon={value} size="lg" />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Built-in app icons">
          <button type="button" className="app-icon-choice" aria-label="Use initials" aria-pressed={!value} disabled={loading} onClick={() => { setError(''); onChange(''); }}>
            <AppIcon name={name || 'App'} size="sm" />
          </button>
          {Object.keys(APP_ICONS).map(key => (
            <button key={key} type="button" className="app-icon-choice" aria-label={`Use ${key} icon`} aria-pressed={value === key} disabled={loading} onClick={() => { setError(''); onChange(key); }}>
              <AppIcon name={name} icon={key} size="sm" />
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="app-logo-upload"><Text variant="body-sm">{loading ? 'Preparing logo…' : 'Upload logo'}</Text></label>
        <input id={id} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" disabled={loading} aria-describedby={`${id}-hint ${id}-error`} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
        {value.startsWith('data:') && <Button variant="ghost" size="sm" disabled={loading} onClick={() => onChange('')}>Remove logo</Button>}
      </div>
      <Text id={`${id}-hint`} variant="meta" as="p">PNG, JPEG or WebP. Logos are resized to fit the app icon.</Text>
      <p id={`${id}-error`} role="status">{error && <Text variant="body-sm" tone="danger">{error}</Text>}</p>
    </fieldset>
  );
}
