import { Check, Plus, Trash2 } from 'lucide-react';
import { AppIcon, Surface, Text } from '../../ui';
import { Button, LINE_ICON_STROKE } from '../ui';

interface Props {
  name: string;
  description: string;
  summary: string;
  selected: boolean;
  installed?: boolean;
  disabled?: boolean;
  deleting?: boolean;
  onToggle(): void;
  onDetails?: () => void;
  onDelete?: () => void;
}

/** Shared catalog presentation for App and Track templates. */
export function TemplateCatalogCard({ name, description, summary, selected, installed = false, disabled = false, deleting, onToggle, onDetails, onDelete }: Props) {
  return <Surface tone="panel-2" border="subtle" radius="card" padding="md" className={`flex h-full flex-col ${selected ? 'ring-1 ring-[var(--brand-accent)]' : ''}`}>
    <div className="flex items-start gap-3"><AppIcon name={name} /><div className="min-w-0">
      <Text as="h3" variant="body" weight="semibold" className="break-words">{name}</Text>
      <Text as="p" variant="meta" tone="subtle">{summary}</Text>
    </div></div>
    <Text as="p" variant="body-sm" tone="muted" className="my-3 line-clamp-3 flex-1">{description}</Text>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button size="sm" variant={selected ? 'secondary' : 'outline'} disabled={installed || disabled}
        aria-label={installed ? `${name} installed` : `${selected ? 'Remove' : 'Add'} ${name}`} aria-pressed={selected}
        icon={selected || installed ? <Check size={14} strokeWidth={LINE_ICON_STROKE} /> : <Plus size={14} strokeWidth={LINE_ICON_STROKE} />}
        onClick={onToggle} className="min-h-11">{installed ? 'Installed' : selected ? 'Selected' : 'Add'}</Button>
      <div className="flex items-center gap-1">
        {onDetails && <Button variant="ghost" size="xs" className="min-h-11" aria-label={`View details for ${name}`} onClick={onDetails}>View details</Button>}
        {onDelete && <Button variant="ghost" size="sm" className="h-11 w-11 shrink-0 p-0"
          aria-label={`Delete ${name} template`} title="Delete template" disabled={disabled || deleting} onClick={onDelete}>
          <Trash2 size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden="true" />
        </Button>}
      </div>
    </div>
  </Surface>;
}
