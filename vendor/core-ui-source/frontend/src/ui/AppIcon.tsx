import { useState } from 'react';
import { BookOpen, Briefcase, Calendar, BarChart3, Globe, Layers, Leaf, Sparkles } from 'lucide-react';

export const APP_ICONS = {
  layers: Layers,
  briefcase: Briefcase,
  book: BookOpen,
  chart: BarChart3,
  calendar: Calendar,
  globe: Globe,
  sparkles: Sparkles,
  leaf: Leaf,
};

const SIZE_CLASSES = { xs: 'app-icon--xs', sm: 'app-icon--sm', md: 'app-icon--md', lg: 'app-icon--lg' };

/** Shared App identity; uploaded raster logos never contact a remote host. */
export function AppIcon({ name, icon, color, size = 'md' }: {
  name: string;
  icon?: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const [failedIcon, setFailedIcon] = useState<string>();
  const Glyph = icon && Object.prototype.hasOwnProperty.call(APP_ICONS, icon)
    ? APP_ICONS[icon as keyof typeof APP_ICONS] : undefined;
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
