import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal, Button, AppSelect, LINE_ICON_STROKE } from '../ui';
import { X } from 'lucide-react';
import { trackViewsApi } from '../../api';
import { viewsForTrackQueryKey } from '../../queryKeys';
import { useToast } from '../../context/ToastContext';
import type { SavedView, EntryTypeNode } from '../../types';

interface ViewSettingsModalProps {
  open: boolean;
  onClose: () => void;
  view: SavedView | null;
  trackId: string;
  entryTypes: EntryTypeNode[];
  /** Opens the Universal View Designer for layout / widget config. */
  onOpenDesigner?: (view: SavedView) => void;
}

/** Slug = lowercase, non-alphanumeric → underscore (matches backend
 *  `_slugify_entry_type_key`). The manifest stores EntryType names as
 *  display strings ("Project Proposal"), but the view's
 *  ``entry_type_keys`` filter uses the slug form ("project_proposal"). */
function slugify(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Editor for a single saved view's configuration.
 *
 *  Surfaces the knobs that change how a view tab projects the track's
 *  entries:
 *  - **Name** — the label that shows in the tab strip.
 *  - **Entry type scope** — optional slug list constraining which
 *    EntryTypes the view surfaces. Empty = unconstrained (every entry).
 *  - **Default entry type for new entries** — pre-selects this slug
 *    when the user adds an entry from inside this view.
 *
 *  Hide / Show / Set-default / Remove are NOT in this modal — they're
 *  one-tap actions in the parent kebab menu. */
export function ViewSettingsModal({
  open,
  onClose,
  view,
  trackId,
  entryTypes,
  onOpenDesigner,
}: ViewSettingsModalProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [entryTypeKeys, setEntryTypeKeys] = useState<string[]>([]);
  const [defaultEntryKey, setDefaultEntryKey] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Re-initialize whenever the target view changes (modal re-uses one
  // mount across edits).
  useEffect(() => {
    if (!view) return;
    setName(view.name || '');
    setEntryTypeKeys(
      Array.isArray(view.entry_type_keys)
        ? view.entry_type_keys.map(s => String(s))
        : []
    );
    const slugs = entryTypes
      .map(et => slugify(String(et.name || '')))
      .filter(Boolean);
    let def = (view.default_entry_type_key || '').trim();
    // Legacy poison: empty manifest default_entry_type slugified to "item".
    if (def === 'item' || (def && !slugs.includes(def))) def = '';
    setDefaultEntryKey(def);
  }, [view, entryTypes]);

  // Build the slug→label map for the entry-type chip palette + default
  // selector. Mirrors the slug the backend uses on the view side so the
  // PUT body lines up with `_apply_view_entry_type_filter`.
  const typeOptions = entryTypes
    .map(et => ({
      slug: slugify(String(et.name || '')),
      name: String(et.name || ''),
    }))
    .filter(o => o.slug);

  const togglePrimaryType = (slug: string) => {
    setEntryTypeKeys(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  };

  const handleSave = async () => {
    if (!view) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('Name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const updated = await trackViewsApi.update(view.id, {
        name: trimmedName,
        entry_type_keys: entryTypeKeys,
        default_entry_type_key: defaultEntryKey || '',
      });
      queryClient.setQueryData(
        viewsForTrackQueryKey(trackId),
        (old: SavedView[] | undefined) => {
          if (!old?.length) return old;
          const idx = old.findIndex(v => v.id === updated.id);
          if (idx < 0) return [...old, updated];
          return old.map(v => (v.id === updated.id ? { ...v, ...updated } : v));
        }
      );
      queryClient.setQueryData(
        ['track', trackId, 'detail'],
        (old: { views?: SavedView[] } | undefined) => {
          if (!old?.views?.length) return old;
          return {
            ...old,
            views: old.views.map(v =>
              v.id === updated.id ? { ...v, ...updated } : v
            ),
          };
        }
      );
      await queryClient.refetchQueries({
        queryKey: viewsForTrackQueryKey(trackId),
        exact: true,
      });
      showToast('View updated', 'success');
      onClose();
    } catch (e) {
      console.error('view update failed', e);
      showToast('Failed to update view', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!view) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit view: ${view.name || 'Untitled'}`}
    >
      <div className="space-y-5 p-4">
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
            Name
          </label>
          <input
            className="app-input text-sm w-full"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="View name"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
            Entry type scope
          </label>
          <p className="text-[11px] text-[var(--text-subtle)] mb-2">
            Restrict this view to one or more entry types. Leave empty to
            show every entry on the track.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {typeOptions.length === 0 ? (
              <span className="text-xs text-[var(--text-subtle)]">
                No entry types on this track yet.
              </span>
            ) : (
              typeOptions.map(o => {
                const active = entryTypeKeys.includes(o.slug);
                return (
                  <button
                    key={o.slug}
                    type="button"
                    onClick={() => togglePrimaryType(o.slug)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                      active
                        ? 'bg-[var(--link)]/15 border-[var(--link)] text-[var(--link)]'
                        : 'border-[var(--panel-border)] text-[var(--text-muted)] hover:bg-[var(--panel-2)]'
                    }`}
                  >
                    {o.name}
                    {active && (
                      <X size={11} strokeWidth={LINE_ICON_STROKE} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
            Default entry type for new entries
          </label>
          <p className="text-[11px] text-[var(--text-subtle)] mb-2">
            Pre-selected when a user creates an entry from inside this
            view. Falls back to the track default when blank.
          </p>
          <AppSelect
            className="app-input text-sm w-full"
            value={defaultEntryKey}
            onValueChange={setDefaultEntryKey}
            options={[
              { value: '', label: 'Use track default' },
              ...typeOptions.map(o => ({
                value: o.slug,
                label: o.name,
              })),
            ]}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          {onOpenDesigner && view ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenDesigner(view)}
              disabled={saving}
            >
              Open designer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
