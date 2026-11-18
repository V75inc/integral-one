import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { RecordNavigation } from '../../hooks/useRecordNavigation';
import { IconButton } from '../../ui';
import { LINE_ICON_STROKE } from '../ui';

export function RecordNavigationControls({ navigation, disabled = false }: {
  navigation: RecordNavigation;
  disabled?: boolean;
}) {
  return <nav aria-label="Record navigation" className="flex items-center gap-1">
    <IconButton label="Previous record" title={disabled ? 'Save or discard your draft before changing records' : 'Previous record'}
      disabled={disabled || navigation.busy || !navigation.canPrevious} onClick={navigation.previous}>
      <ChevronLeft size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
    </IconButton>
    <span className="sr-only" role="status">{navigation.busy ? 'Loading record…' : navigation.label}</span>
    <IconButton label="Next record" title={disabled ? 'Save or discard your draft before changing records' : 'Next record'}
      disabled={disabled || navigation.busy || !navigation.canNext} onClick={navigation.next}>
      <ChevronRight size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
    </IconButton>
  </nav>;
}
