import { useMemo, useState } from 'react';
import type { DocumentFieldSpec } from './api';
import { AppSelect } from '../../components/ui/AppSelect';
import { Text } from '../../ui';

interface AppOption {
  id: string;
  name: string;
}

interface TrackOption {
  id: string;
  title: string;
}

interface Props {
  fields: DocumentFieldSpec[];
  loading?: boolean;
  error?: string;
  onInsert: (field: DocumentFieldSpec) => void;
  onSearch?: (q: string) => void;
  apps?: AppOption[];
  selectedAppId?: string;
  onSelectApp?: (appId: string) => void;
  appsLoading?: boolean;
  tracks?: TrackOption[];
  selectedTrackId?: string;
  onSelectTrack?: (trackId: string) => void;
  tracksLoading?: boolean;
  /** Inside {@link FieldBrowserPanel} — no outer chrome or title (collapsible header owns those). */
  embedded?: boolean;
}

export function FieldBrowser({
  fields,
  loading,
  error,
  onInsert,
  onSearch,
  apps,
  selectedAppId,
  onSelectApp,
  appsLoading,
  tracks,
  selectedTrackId,
  onSelectTrack,
  tracksLoading,
  embedded = false,
}: Props) {
  const [q, setQ] = useState('');

  const grouped = useMemo(() => {
    const map = new Map<string, DocumentFieldSpec[]>();
    for (const f of fields) {
      const cat = f.category || f.context_key || 'General';
      const list = map.get(cat) || [];
      list.push(f);
      map.set(cat, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [fields]);

  const Root = embedded ? 'div' : 'aside';

  return (
    <Root
      className={[
        'doc-field-browser',
        embedded ? 'doc-field-browser--embedded' : '',
      ].join(' ')}
      aria-label={embedded ? undefined : 'Available fields'}
    >
      <div className="doc-field-browser__header">
        {!embedded ? (
          <>
            <Text as="h3" variant="heading-sm">
              Available Fields
            </Text>
            <Text variant="body-sm" tone="muted">
              Choose an app and track, then click a field to insert it into the
              template.
            </Text>
          </>
        ) : null}
        <div className="doc-field-browser__pickers">
          {onSelectApp ? (
            <label className="doc-field-browser__picker">
              <span className="doc-field-browser__picker-label">App</span>
              <AppSelect
                aria-label="App"
                value={selectedAppId || ''}
                disabled={appsLoading || !apps?.length}
                onValueChange={onSelectApp}
                placeholder={
                  appsLoading
                    ? 'Loading apps…'
                    : apps?.length
                      ? 'Select an app'
                      : 'No apps installed'
                }
                className="app-input"
                options={[
                  {
                    value: '',
                    label: appsLoading
                      ? 'Loading apps…'
                      : apps?.length
                        ? 'Select an app'
                        : 'No apps installed',
                  },
                  ...(apps || []).map(a => ({
                    value: a.id,
                    label: a.name,
                  })),
                ]}
              />
            </label>
          ) : null}
          {onSelectTrack ? (
            <label className="doc-field-browser__picker">
              <span className="doc-field-browser__picker-label">Track</span>
              <AppSelect
                aria-label="Track"
                value={selectedTrackId || ''}
                disabled={!selectedAppId || tracksLoading || !tracks?.length}
                onValueChange={onSelectTrack}
                placeholder={
                  !selectedAppId
                    ? 'Select an app first'
                    : tracksLoading
                      ? 'Loading tracks…'
                      : tracks?.length
                        ? 'Select a track'
                        : 'No tracks in this app'
                }
                className="app-input"
                options={[
                  {
                    value: '',
                    label: !selectedAppId
                      ? 'Select an app first'
                      : tracksLoading
                        ? 'Loading tracks…'
                        : tracks?.length
                          ? 'Select a track'
                          : 'No tracks in this app',
                  },
                  ...(tracks || []).map(t => ({
                    value: t.id,
                    label: t.title,
                  })),
                ]}
              />
            </label>
          ) : null}
        </div>
        <input
          type="search"
          className="doc-field-browser__search"
          placeholder="Search fields…"
          disabled={!selectedTrackId}
          value={q}
          onChange={e => {
            setQ(e.target.value);
            onSearch?.(e.target.value);
          }}
        />
      </div>
      {loading ? (
        <Text as="p" variant="body" tone="muted" className="p-3">Loading…</Text>
      ) : error ? (
        <div className="p-3">
          <Text variant="body-sm" tone="muted">
            {error}
          </Text>
        </div>
      ) : grouped.length === 0 ? (
        <div className="p-3">
          <Text variant="body-sm" tone="muted">
            {!selectedAppId
              ? 'Select an installed app to browse its fields.'
              : !selectedTrackId
                ? 'Select a track to see its entry fields.'
                : 'This track’s content profile has no entry-type fields yet.'}
          </Text>
        </div>
      ) : (
        <div className="doc-field-browser__groups">
          {grouped.map(([category, items]) => (
            <div key={category} className="doc-field-browser__group">
              <div className="doc-field-browser__group-title">{category}</div>
              <ul>
                {items.map(f => (
                  <li key={f.key}>
                    <button
                      type="button"
                      className="doc-field-browser__item"
                      title={f.key}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData(
                          'application/x-doc-field',
                          JSON.stringify(f),
                        );
                      }}
                      onClick={() => onInsert(f)}
                    >
                      <span className="doc-field-browser__label">{f.label}</span>
                      <span className="doc-field-browser__key" title={f.key}>
                        {f.placeholder || `{{${f.key}}}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Root>
  );
}
