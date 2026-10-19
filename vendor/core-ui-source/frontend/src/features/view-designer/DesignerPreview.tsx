import { useEffect, useState } from 'react';
import {
  ContributionLifecycleContext,
  type ContributionLifecycleApi,
  type ContributionLifecycleHandle,
} from '../../components/entries/contributionLifecycle';
import { ViewRenderer } from '../../views/registry';
import type { Entry, SavedView } from '../../types';
import { Surface, Text } from '../../ui';

type DesignerPreviewProps = {
  view: SavedView | null;
  trackId: string;
  entries?: Entry[];
  previewFields?: Record<string, unknown>;
  entryId?: string;
  appId?: string;
  entryTypeKey?: string;
};

export function DesignerPreview({
  view,
  trackId,
  entries = [],
  previewFields,
  entryId,
  appId,
  entryTypeKey,
}: DesignerPreviewProps) {
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(
    () => ({ ...(previewFields || {}) })
  );

  useEffect(() => {
    setCustomFields({ ...(previewFields || {}) });
  }, [previewFields]);

  const lifecycle: ContributionLifecycleApi = {
    mode: 'edit',
    placement: 'entry_detail',
    entryId,
    trackId,
    entryTypeKey,
    appId,
    customFields,
    onDraftPatch: patch => {
      if (patch.custom_fields) {
        setCustomFields(prev => ({ ...prev, ...patch.custom_fields }));
      }
    },
    register: (_handle: ContributionLifecycleHandle) => () => undefined,
  };

  if (!view) {
    return (
      <Text
        as="div"
        variant="body"
        tone="muted"
        data-testid="designer-preview-empty"
        className="h-full flex items-center justify-center"
      >
        No view selected
      </Text>
    );
  }

  const boundView: SavedView = {
    ...view,
    track_id: trackId,
    config: {
      ...(view.config || {}),
      __bindings: {
        entryId,
        entryValues: customFields,
        __contributionMode: 'edit',
        __contributionPlacement: 'entry_detail',
        entry_type_key: entryTypeKey,
        trackId,
        appId,
      },
    },
  };

  return (
    <Surface
      data-testid="designer-preview"
      className="h-full min-h-0 overflow-auto p-3"
    >
      <ContributionLifecycleContext.Provider value={lifecycle}>
        <ViewRenderer
          view={boundView}
          entries={entries}
          isLoading={false}
          onEntryOpen={() => undefined}
          isEditor
        />
      </ContributionLifecycleContext.Provider>
    </Surface>
  );
}
