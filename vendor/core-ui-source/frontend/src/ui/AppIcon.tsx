import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { knownManifestIcon } from '../lib/manifestLucideIcon';

/** Icons offered in the App icon picker; any name in the manifest list is also drawn when an App's package names it. */
export const APP_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  ['layers', 'briefcase', 'book', 'chart', 'calendar', 'globe', 'sparkles', 'leaf', 'banknote', 'receipt', 'calculator', 'landmark', 'wallet', 'users', 'building', 'shield', 'rocket', 'truck', 'graduation-cap', 'gavel']
    .map(key => [key, knownManifestIcon(key)] as const)
    .filter((entry): entry is readonly [string, LucideIcon] => Boolean(entry[1])),
);

const SIZE_CLASSES = { xs: 'app-icon--xs', sm: 'app-icon--sm', md: 'app-icon--md', lg: 'app-icon--lg' };

/** Shared App identity; uploaded raster logos never contact a remote host. */
export function AppIcon({ name, icon, color, size = 'md' }: {
  name: string;
  icon?: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const [failedIcon, setFailedIcon] = useState<string>();
  const Glyph = knownManifestIcon(icon);
  const raster = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(icon || '') && (icon?.length || 0) < 175000;
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase() || 'A';
  return (
    <span aria-hidden="true" className={`app-icon ${SIZE_CLASSES[size]}`} style={{ color: color || 'var(--brand-accent)' }}>
      {raster && failedIcon !== icon ? (
        <img src={icon} alt="" className="h-full w-full object-contain p-1.5" onError={() => setFailedIcon(icon)} />
      ) : Glyph ? (
        <Glyph size={size === 'xs' ? 18 : size === 'sm' ? 16 : size === 'lg' ? 32 : 28} strokeWidth={1.5} />
      ) : <span>{initials}</span>}
    </span>
  );
}
