import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { Maximize2, Minimize2, Plus, Send } from 'lucide-react';
import { Button, LINE_ICON_STROKE } from '../ui';
import { Modal } from '../ui/Modal';
import { IconButton } from '../../ui';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../features/settings/store';
import type { Entry, Track } from '../../types';
import { EntryFormExpandedView, useEntryExpandedForm } from './EntryFormExpanded';
import {
  EntryContributionSlot,
  resolveEntryContribution,
  type EntryContributionSlotHandle,
} from './EntryContributionSlot';
import { CreateWizardModal, findCreateWizardEntryType } from './CreateWizardModal';

/** Stable empty list: default param ``tracks = []`` is a *new* array every render and breaks effect deps. */
const EMPTY_TRACKS: Track[] = [];

interface EntryComposerProps {
  track?: Track;
  tracks?: Track[];
  /** While the parent is fetching the track list (e.g. feed); avoids showing “no tracks” during load. */
  tracksListLoading?: boolean;
  /** When composing inside a track view that constrains entry types, pass
   *  those constraints so the type picker (and default) stay in-view. */
  viewEntryTypeKeys?: string[];
  viewDefaultEntryTypeKey?: string;
  createCustomFieldFallback?: () => Record<string, unknown> | undefined;
  workflowEnumLabels?: Record<string, Record<string, string>>;
  onCreated?(entry: Entry): void;
}

export interface EntryComposeSeed {
  title?: string;
  type?: string;
  custom_fields?: Record<string, unknown>;
}

interface EntryComposeModalProps {
  open: boolean;
  track?: Track;
  tracks?: Track[];
  seed: EntryComposeSeed;
  viewEntryTypeKeys?: string[];
  viewDefaultEntryTypeKey?: string;
  createCustomFieldFallback?: () => Record<string, unknown> | undefined;
  workflowEnumLabels?: Record<string, Record<string, string>>;
  primaryLabel?: string;
  modalTitle?: string;
  onClose(): void;
  onCreated?(entry: Entry): void;
}

/** Full create form in a dialog — used by EntryComposer and view quick-add fallbacks. */
export function EntryComposeModal({
  open,
  track,
  tracks,
  seed,
  viewEntryTypeKeys,
  viewDefaultEntryTypeKey,
  createCustomFieldFallback,
  workflowEnumLabels,
  primaryLabel = 'Create',
  modalTitle = 'New entry',
  onClose,
  onCreated
}: EntryComposeModalProps) {
  const { showToast } = useToast();
  const [settings, updateSettings] = useSettings();
  const entryDialogExpanded = Boolean(settings.appearance.entryDialogExpanded);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contributionApiRef = useRef<EntryContributionSlotHandle | null>(null);
  const tracksList = tracks ?? EMPTY_TRACKS;
  const needsTrackPicker = !track;
  const form = useEntryExpandedForm({
    mode: 'create',
    enabled: open,
    relationsEnabled: open,
    track,
    tracksList,
    needsTrackPicker,
    initialTitle: seed.title,
    initialType: seed.type,
    initialCustomFields: seed.custom_fields,
    viewEntryTypeKeys,
    viewDefaultEntryTypeKey,
    createCustomFieldFallback,
    workflowEnumLabels,
    showToast,
    contributionApiRef,
    contributionPlacement: 'entry_compose',
    onCreated: entry => {
      onCreated?.(entry);
      onClose();
    }
  });

  const { composerInviteText: _invite, composerActionLabel: _action, ...formViewProps } = form;
  const composeExtraSection = (
    <EntryContributionSlot
      ref={contributionApiRef}
      placement="entry_compose"
      appId={form.appId}
      formSchema={form.entryTypeFormSchema}
      trackId={track?.id || form.selectedTrackId || undefined}
      entryTypeKey={form.type}
      mode="create"
      customFields={form.fieldValues}
      onDraftPatch={patch => form.applyContributionPatch(patch)}
    />
  );
  const useWideModal = Boolean(
    resolveEntryContribution(form.entryTypeFormSchema, 'entry_compose') ||
      (form.entryTypeFormSchema?.ui_contributions || []).some(
        c => c.placement === 'entry_compose' || c.layout === 'wide'
      )
  );
  const modalWidth = entryDialogExpanded
    ? 'max-w-dialog-workspace-max'
    : useWideModal
      ? 'max-w-dialog-wide'
      : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      initialFocusRef={titleInputRef}
      width={modalWidth}
      tall={entryDialogExpanded}
      headerActions={
        <IconButton
          label={entryDialogExpanded ? 'Exit full size' : 'Expand dialog'}
          title={entryDialogExpanded ? 'Exit full size' : 'Expand dialog'}
          size="md"
          onClick={() =>
            updateSettings(prev => ({
              ...prev,
              appearance: {
                ...prev.appearance,
                entryDialogExpanded: !prev.appearance.entryDialogExpanded,
              },
            }))
          }
          aria-pressed={entryDialogExpanded}
          data-testid="entry-compose-dialog-expand"
        >
          {entryDialogExpanded ? (
            <Minimize2 size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
          ) : (
            <Maximize2 size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
          )}
        </IconButton>
      }
    >
      <EntryFormExpandedView
        {...formViewProps}
        composeExtraSection={composeExtraSection}
        titleInputRef={titleInputRef}
        focusTitleOnMount
        primaryLabel={primaryLabel}
        primaryIcon={<Send size={13} strokeWidth={LINE_ICON_STROKE} />}
        onPrimary={() => void form.handleSubmitCreate()}
        onCancel={onClose}
      />
    </Modal>
  );
}

export function EntryComposer({
  track,
  tracks,
  tracksListLoading = false,
  viewEntryTypeKeys,
  viewDefaultEntryTypeKey,
  createCustomFieldFallback,
  workflowEnumLabels,
  onCreated
}: EntryComposerProps) {
  const tracksList = tracks === undefined ? EMPTY_TRACKS : tracks;
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [composeSeed, setComposeSeed] = useState<EntryComposeSeed>({});
  const [modalSession, setModalSession] = useState(0);

  const needsTrackPicker = !track;
  const hasNoTracks = needsTrackPicker && !tracksListLoading && tracksList.length === 0;

  /** Profile-aware action label when the track is known (or feed fallback via default slug). */
  const profilePreview = useEntryExpandedForm({
    mode: 'create',
    enabled: !hasNoTracks,
    relationsEnabled: false,
    track,
    tracksList,
    needsTrackPicker,
    viewEntryTypeKeys,
    viewDefaultEntryTypeKey,
    showToast
  });
  const actionLabel = profilePreview.composerActionLabel;

  // Opt-in per entry type (form_schema.create_wizard) — e.g. payroll-app's
  // pay_run — routes to the generic multi-step CreateWizardModal instead
  // of the default single-form compose dialog. Every entry type that
  // doesn't declare one keeps today's behavior untouched.
  const wizardEntryType = useMemo(
    () => findCreateWizardEntryType(profilePreview.entryTypes, viewDefaultEntryTypeKey),
    [profilePreview.entryTypes, viewDefaultEntryTypeKey]
  );
  const [wizardOpen, setWizardOpen] = useState(false);

  const openComposeModal = useCallback(() => {
    flushSync(() => {
      setComposeSeed({});
      setModalSession(s => s + 1);
      setModalOpen(true);
    });
  }, []);

  const closeComposeModal = () => {
    setModalOpen(false);
    setComposeSeed({});
  };

  // Keyboard shortcut: plain `N` opens the create dialog when the user
  // isn't already typing in another input/textarea/contenteditable surface.
  useEffect(() => {
    if (modalOpen || hasNoTracks || tracksListLoading) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'n') return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      e.preventDefault();
      openComposeModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalOpen, hasNoTracks, tracksListLoading, openComposeModal]);

  return (
    <div className="min-w-0">
      {tracksListLoading && needsTrackPicker ? (
        <Button
          variant="outline"
          size="sm"
          disabled
          loading
          aria-busy="true"
          aria-label="Loading tracks you can post to"
          className="!py-2"
        >
          New entry
        </Button>
      ) : hasNoTracks ? (
        <div className="space-y-2 text-sm">
          <p className="text-[var(--text-muted)] leading-relaxed max-w-md">
            Every post lives on a{' '}
            <span className="text-[var(--text)]">track</span>. Create a track or join one
            you have access to, then you can add entries.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              to="/apps"
              className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
            >
              Open Apps
            </Link>
            <span className="text-[var(--text-subtle)]" aria-hidden>
              ·
            </span>
            <Link
              to="/tracks"
              className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
            >
              Browse tracks
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Plus size={14} strokeWidth={LINE_ICON_STROKE} />}
            onClick={wizardEntryType ? () => setWizardOpen(true) : openComposeModal}
            aria-label={actionLabel}
            title={`${actionLabel} (N)`}
            className="!py-2"
          >
            {actionLabel}
          </Button>
          <span
            title="Keyboard shortcut: N"
            aria-label="Keyboard shortcut: N"
            className="
              hidden sm:inline-flex items-center
              font-mono text-[11px] leading-none
              px-1.5 py-1 rounded
              border border-[var(--panel-border)]
              bg-[var(--panel)]
              text-[var(--text-subtle)]
            "
          >
            N
          </span>
        </div>
      )}

      <EntryComposeModal
        key={modalSession}
        open={modalOpen}
        track={track}
        tracks={tracks}
        seed={composeSeed}
        viewEntryTypeKeys={viewEntryTypeKeys}
        viewDefaultEntryTypeKey={viewDefaultEntryTypeKey}
        createCustomFieldFallback={createCustomFieldFallback}
        workflowEnumLabels={workflowEnumLabels}
        primaryLabel="Post"
        modalTitle={actionLabel}
        onClose={closeComposeModal}
        onCreated={onCreated}
      />

      {wizardEntryType && track ? (
        <CreateWizardModal
          open={wizardOpen}
          track={track}
          entryType={wizardEntryType}
          onClose={() => setWizardOpen(false)}
          onCreated={entry => {
            onCreated?.(entry);
            setWizardOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
