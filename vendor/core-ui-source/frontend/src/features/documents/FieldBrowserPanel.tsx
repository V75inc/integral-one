import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../components/ui/collapsible';
import { Surface, Text } from '../../ui';
import { FieldBrowser } from './FieldBrowser';
import type { ComponentProps } from 'react';

type FieldBrowserProps = ComponentProps<typeof FieldBrowser>;

export function FieldBrowserPanel(props: FieldBrowserProps) {
  const { apps, tracks, selectedAppId, selectedTrackId, fields } = props;
  const [panelOpen, setPanelOpen] = useState(false);

  const selectionSummary = useMemo(() => {
    const app = apps?.find(a => a.id === selectedAppId);
    const track = tracks?.find(t => t.id === selectedTrackId);
    const parts: string[] = [];
    if (app?.name) parts.push(app.name);
    if (track?.title) parts.push(track.title);
    if (!parts.length) return null;
    const suffix =
      selectedTrackId && fields.length
        ? ` · ${fields.length} field${fields.length === 1 ? '' : 's'}`
        : '';
    return `${parts.join(' · ')}${suffix}`;
  }, [apps, fields.length, selectedAppId, selectedTrackId, tracks]);

  return (
    <Surface as="section" padding="lg" className="page-setup-panel field-browser-panel">
      <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
        <CollapsibleTrigger className="page-setup-panel__trigger group flex w-full min-w-0 items-start gap-2.5 rounded-md text-left">
          <Text as="span" tone="muted" className="mt-0.5 shrink-0">
            <ChevronDown
              size={18}
              strokeWidth={2}
              className="page-setup-panel__chevron"
              aria-hidden
            />
          </Text>
          <div className="min-w-0 max-w-xl flex-1">
            <Text variant="heading-sm" as="h3">
              Available fields
            </Text>
            <Text variant="body-sm" tone="muted" className="mt-1">
              Choose an app and track, then click a field to insert it into the
              template.
            </Text>
            {selectionSummary ? (
              <Text variant="body-sm" tone="muted" weight="medium" className="mt-2">
                {selectionSummary}
              </Text>
            ) : null}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="page-setup-panel__content">
          <FieldBrowser {...props} embedded />
        </CollapsibleContent>
      </Collapsible>
    </Surface>
  );
}
