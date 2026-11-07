import { useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Text } from '../../ui';
import {
  ExperienceModeContext,
  useExperienceMode,
} from './experienceModeContext';

/** Optional presentation preference. It never changes values or grants authority. */
export function ExperienceMode({ children }: { children: ReactNode }) {
  const inherited = useExperienceMode();
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  if (inherited) return <>{children}</>;
  return (
    <ExperienceModeContext.Provider value={mode}>
      <div className="space-y-3">
        <div
          role="group"
          aria-label="Form detail level"
          className="flex flex-wrap items-center gap-2"
        >
          <Button
            type="button"
            size="sm"
            variant={mode === 'simple' ? 'primary' : 'secondary'}
            aria-pressed={mode === 'simple'}
            onClick={() => setMode('simple')}
          >
            Simple
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'advanced' ? 'primary' : 'secondary'}
            aria-pressed={mode === 'advanced'}
            onClick={() => setMode('advanced')}
          >
            Advanced
          </Button>
          <Text variant="body-sm" tone="muted">
            {mode === 'simple'
              ? 'Essential details. Show Advanced for more options.'
              : 'All details. Your entries stay the same when switching modes.'}
          </Text>
        </div>
        {children}
      </div>
    </ExperienceModeContext.Provider>
  );
}
