import { useCallback, useEffect, useRef, useState } from 'react';
import { useSerialPolling } from '../../hooks/useSerialPolling';
import { ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { Surface, Text } from '../../ui';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { toolsApi } from '../../api/tools';
import { attachmentsApi } from '../../api/attachments';
import { entriesApi, entryTypesApi } from '../../api';
import { actionFileToFile, downloadActionFile, isActionFile } from '../../api/actionFiles';
import { requestOpenCompanionChat } from '../../features/ai-chat/chatHandoff';
import { useScopeOptional } from '../../context/ScopeContext';
import { isVisible, type VisibleIf } from './regionConditions';
import type { ViewWidgetProps } from './types';

export interface ActionBarButtonSpec {
  key: string;
  label: string;
  /** Reserved for a future icon-name -> component lookup; unused in v1. */
  icon?: string;
  style?: 'primary' | 'secondary' | 'danger';
  /** 'tool' (default) calls ``app.tools[]`` via the tools API; 'client' runs
   *  a named built-in browser-side action (see CLIENT_ACTIONS) with no
   *  backend call at all — for operations ToolContext genuinely can't do
   *  (e.g. bulk-delete: there is no ``ToolContext.delete_entry``). */
  mode?: 'tool' | 'client';
  /** Key in the workspace's ``app.tools[]`` registry to invoke. Required
   *  when mode is 'tool' (the default). */
  tool?: string;
  /** Key into CLIENT_ACTIONS below. Required when mode is 'client'. */
  client_action?: string;
  /** For ``client_action: ask_assistant``: the message put in the assistant's
   *  composer (the person reviews and sends it). The assistant already knows
   *  which entry is open. */
  prompt?: string;
  confirm?: boolean;
  confirm_message?: string;
  /** Whether the tool's JSON output carries a ``file`` payload to download. */
  produces_file?: boolean;
  /** Whether a produced file should also be persisted as an Attachment on
   *  the entry (via the existing attachment-upload endpoint — no new
   *  backend route). Only meaningful when ``produces_file`` is true. */
  persist_as_attachment?: boolean;
  /**
   * Turns this button into a single labeled dropdown offering a small set
   * of variants of the SAME action (e.g. "Export Register" → CSV / PDF)
   * instead of one button per variant. Picking an option calls the SAME
   * `tool` with `{[option_param || 'format']: option.value}` merged into
   * the usual `{entry_id}` payload — the tool itself branches on that
   * param. Generic, reusable for any button that's really "one action,
   * pick a format/variant," not payroll-specific.
   */
  options?: { value: string; label: string }[];
  /** Param name the selected option's `value` is sent under. Defaults to
   *  `'format'`. Only meaningful when `options` is set. */
  option_param?: string;
  /**
   * Grays the button out (and skips the confirm dialog / tool call
   * entirely on click) when the host entry's current field value matches —
   * e.g. `{field: 'status', equals: 'paid'}` on a "Finalize Pay Run"
   * button whose own `confirm_message` already promises "once paid,
   * re-finalizing is disabled." Server-side the tool itself refuses the
   * same way (belt-and-suspenders), but leaving the button fully clickable
   * forever read as broken — a user finalizes, the tool bumps status, and
   * the exact same button sits there inviting a second click with no
   * visual change. Evaluated against `bindings.entryValues`
   * (RelatedViewsSection forwards the host entry's live `custom_fields`);
   * absent `entryValues` (e.g. no host wired it yet), never disables —
   * same fail-open default `visible_if` uses elsewhere in the region
   * system.
   */
  disabled_if?: VisibleIf;
  /** Hides the button unless the host entry's field matches, e.g.
   *  `{field: 'status', in: ['waiting_for_approval']}` so only the one next step
   *  is offered. Absent `entryValues` never hides (fail-open, like disabled_if). */
  visible_if?: VisibleIf;
  /** Why the button is greyed out, shown on hover when ``disabled_if`` matches. */
  disabled_reason?: string;
  /** 'end' puts the button in the right-hand group with the actions that move
   *  the record forward; the default 'start' keeps it on the left. */
  placement?: 'start' | 'end';
  /** Disabled, with an explanation, unless the viewer is a workspace owner or admin. */
  requires_admin?: boolean;
}

interface ClientActionArgs {
  entries: ViewWidgetProps['entries'];
  trackId?: string;
}

/** Built-in browser-side actions, addressed by ``client_action`` key. Each
 *  operates only on data already available to the widget (its bound
 *  track's entries) via APIs every other widget already uses — no new
 *  backend route. */
const CLIENT_ACTIONS: Record<string, (args: ClientActionArgs) => Promise<void>> = {
  async clear_anchored_track_entries({ entries }) {
    await Promise.all(entries.map(entry => entriesApi.delete(entry.id)));
  },
};

/** Resolves the track's entry type for row creation (mirrors
 *  EditableTableWidget's activeEntryType lookup) — only fetched on demand,
 *  when a tool response actually needs it (e.g. an import action's parsed
 *  rows), to avoid the extra round-trip on every render. */
async function resolveEntryType(trackId: string, defaultEntryTypeKey?: string) {
  const types = await entryTypesApi.list({ track_id: trackId });
  if (!types.length) return undefined;
  if (defaultEntryTypeKey) {
    const byManifestKey = types.find(
      et => et.form_schema?._manifest_entry_type_key === defaultEntryTypeKey
    );
    if (byManifestKey) return byManifestKey;
  }
  return types[0];
}

/**
 * Renders a row of buttons declared in ``related_views[].bind.buttons``
 * (forwarded by ComposableViewSlot as ``view.config.__bindings.buttons``).
 * Each button invokes a workspace tool via the existing, unmodified
 * ``POST /api/tools/{key}`` endpoint. File-producing actions decode the
 * base64 payload into a Blob, trigger an immediate download, and — when
 * ``persist_as_attachment`` — separately upload the same bytes through the
 * existing attachment endpoint so the file also shows up in the entry's
 * Attachments (two round-trips, zero new backend code).
 */
/** Single labeled trigger + small option menu — same open/outside-click/
 *  Escape mechanics as `KebabMenu.tsx`, repackaged with a labeled trigger
 *  (button's own `label` + chevron) instead of a bare icon, since this
 *  reads as "one action with a format choice," not an overflow menu. */
function ActionBarDropdownButton({
  button,
  running,
  disabled,
  onSelect,
}: {
  button: ActionBarButtonSpec;
  running: boolean;
  disabled: boolean;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !wrapperRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <Button
        variant={button.style || 'secondary'}
        size="sm"
        loading={running}
        disabled={disabled}
        onClick={() => setOpen(s => !s)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1.5">
          {button.label}
          <ChevronDown size={14} strokeWidth={1.5} />
        </span>
      </Button>
      {open ? (
        <Surface
          tone="panel"
          radius="card"
          elevation="pop"
          role="menu"
          className="absolute left-0 top-full mt-1 z-30 min-w-[160px] py-1 text-left animate-fade-in"
        >
          <div onClick={e => e.stopPropagation()}>
            {(button.options || []).map(opt => (
              <Button
                key={opt.value}
                type="button"
                variant="ghost"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSelect(opt.value);
                }}
                className="w-full justify-start rounded-none"
              >
                <Text as="span" variant="body-sm" className="truncate">
                  {opt.label}
                </Text>
              </Button>
            ))}
          </div>
        </Surface>
      ) : null}
    </div>
  );
}

export function ActionBarWidget({ view, entries }: ViewWidgetProps) {
  const scope = useScopeOptional();
  const viewerRole = scope?.activeWorkspace?.your_role;
  // Unknown role never blocks (the server enforces admin-only actions regardless).
  const viewerIsAdmin = viewerRole === undefined || viewerRole === 'owner' || viewerRole === 'admin';
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [runningKey, setRunningKey] = useState<string | null>(null);

  const config = (view.config || {}) as Record<string, unknown>;
  const bindings = (config.__bindings || {}) as Record<string, unknown>;
  const allButtons = (bindings.buttons ?? config.buttons ?? []) as ActionBarButtonSpec[];
  const entryId = typeof bindings.entryId === 'string' ? bindings.entryId : undefined;
  const entryValues = bindings.entryValues as Record<string, unknown> | undefined;
  const buttons = allButtons.filter(
    b => !b.visible_if || !entryValues || isVisible(b.visible_if, entryValues)
  );
  // Bumps RelatedViewsSection's shared refreshNonce (see that file's own
  // docstring) — a tool call is a side effect entirely outside the normal
  // entry-mutation callbacks, so nothing else on the page would otherwise
  // learn a button just changed data a sibling slot is showing.
  const onActionComplete =
    typeof bindings.onActionComplete === 'function'
      ? (bindings.onActionComplete as () => void)
      : undefined;
  const onHostChanged =
    typeof bindings.onHostChanged === 'function' ? (bindings.onHostChanged as () => void | Promise<void>) : undefined;
  // While the record's field matches this (e.g. status is "finalizing"), keep reloading
  // it so the buttons follow a change made by a background job.
  const refreshWhile = bindings.refresh_while as VisibleIf | undefined;
  const polling = !!refreshWhile && !!onHostChanged && isVisible(refreshWhile, entryValues);
  const refreshInFlight = useRef(false);
  const refreshHost = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      await onHostChanged?.();
    } finally {
      refreshInFlight.current = false;
    }
  }, [onHostChanged]);
  useSerialPolling(refreshHost, 4000, polling);

  if (!buttons.length) return null;

  const isStatusDisabled = (button: ActionBarButtonSpec) =>
    // isVisible()'s own default is "no condition = always visible" (true) —
    // exactly backwards for a disabled check, which must default to
    // "no condition = never disabled" (false). Only defer to isVisible's
    // actual equality match once a disabled_if is actually present.
    (!!button.disabled_if && isVisible(button.disabled_if, entryValues)) ||
    (!!button.requires_admin && !viewerIsAdmin);

  const run = async (button: ActionBarButtonSpec, extraInput?: Record<string, unknown>) => {
    if (isStatusDisabled(button)) return;
    if (button.confirm) {
      const ok = await confirm({
        title: button.label,
        message: button.confirm_message || `Run "${button.label}"?`,
        variant: button.style === 'danger' ? 'danger' : 'default',
      });
      if (!ok) return;
    }
    setRunningKey(button.key);
    try {
      if (button.mode === 'client' && button.client_action === 'ask_assistant') {
        // Hand the open entry to the assistant with a ready-to-send request.
        requestOpenCompanionChat({ draftText: button.prompt || button.label });
        return;
      }
      if (button.mode === 'client') {
        const action = button.client_action ? CLIENT_ACTIONS[button.client_action] : undefined;
        if (!action) {
          showToast(`Unknown client action "${button.client_action}"`, 'error');
          return;
        }
        await action({ entries, trackId: view.track_id });
        showToast(`${button.label} complete`, 'success');
        onActionComplete?.();
        return;
      }

      if (!button.tool) {
        showToast(`Button "${button.label}" has no tool configured`, 'error');
        return;
      }
      const { output } = await toolsApi.call(button.tool, {
        ...(entryId ? { entry_id: entryId } : {}),
        ...extraInput,
      });
      // A tool that returns {ok: false, reason} is reporting a clean,
      // expected failure (missing required data, nothing to do, etc.) —
      // distinct from an HTTP/network error, which the catch block below
      // already surfaces. Without this check, a false `ok` fell through to
      // every branch below finding nothing to do (no `file`, no `rows`)
      // and landed on the generic "complete" success toast at the bottom —
      // actively telling the user it worked when it hadn't (found live:
      // "Generate Payslips" on a Pay Run missing its period end date).
      if (output.ok === false) {
        const reason = typeof output.reason === 'string' && output.reason ? output.reason : 'failed';
        showToast(`${button.label}: ${reason}`, 'error');
        // Some batch tools retain successful writes and report partial failure.
        if (Array.isArray(output.object_refs) && output.object_refs.length > 0) {
          onActionComplete?.();
        }
        return;
      }
      if (button.produces_file && isActionFile(output.file)) {
        downloadActionFile(output.file);
        if (button.persist_as_attachment && entryId) {
          try {
            await attachmentsApi.uploadForEntry(entryId, actionFileToFile(output.file));
          } catch (attachErr) {
            // A byte-identical regenerate (no data changed since the last
            // Generate click) hits the attachment endpoint's per-entry
            // SHA-256 dedup check (409) — the file is already on record,
            // so this isn't a failure worth alarming the user over. Any
            // other status is a genuine persistence failure.
            const status = (attachErr as { response?: { status?: number } })?.response?.status;
            if (status !== 409) {
              showToast(`${button.label} succeeded but saving the attachment failed`, 'error');
            }
          }
        }
      } else if (Array.isArray(output.rows) && view.track_id) {
        const entryType = await resolveEntryType(view.track_id, view.default_entry_type_key);
        if (!entryType) {
          showToast(`${button.label}: could not resolve entry type for import`, 'error');
          return;
        }
        let created = 0;
        let skipped = 0;
        // The tool owns field-name knowledge (NIS's wage_period_N vs.
        // PAYE's value_7a, etc.) and hands back a ready-to-write
        // custom_fields dict per row — this widget stays generic across
        // every app that wires an import-style action, not just NIS/PAYE.
        for (const row of output.rows as Array<Record<string, unknown>>) {
          const customFields = row.custom_fields as Record<string, unknown> | undefined;
          if (!row.employee_id || !customFields) {
            skipped += 1;
            continue;
          }
          await entriesApi.create({
            track_id: view.track_id,
            type: entryType.form_schema?._manifest_entry_type_key || entryType.name,
            type_id: entryType.id,
            title: '',
            custom_fields: customFields,
          });
          created += 1;
        }
        const unresolved = typeof output.unresolved_count === 'number' ? output.unresolved_count : skipped;
        showToast(
          unresolved > 0
            ? `${button.label}: imported ${created} row(s), ${unresolved} skipped (no matching employee)`
            : `${button.label}: imported ${created} row(s)`,
          unresolved > 0 ? 'error' : 'success'
        );
        if (created > 0) onActionComplete?.();
        return;
      }
      const summary = typeof output.summary === 'string' ? output.summary.trim().slice(0, 500) : '';
      showToast(summary || `${button.label} complete`, 'success');
      onActionComplete?.();
      onHostChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed';
      showToast(message, 'error');
    } finally {
      setRunningKey(null);
    }
  };

  // Danger buttons (destructive — "Clear all", etc.) group to the opposite
  // side from everything else, matching the normal UI convention of
  // keeping destructive actions visually separated from the primary
  // workflow instead of bunched in with them in declaration order.
  const mainButtons = buttons.filter(b => b.style !== 'danger' && b.placement !== 'end');
  // Right-hand group: actions that move the record forward, then destructive ones.
  const dangerButtons = [
    ...buttons.filter(b => b.style !== 'danger' && b.placement === 'end'),
    ...buttons.filter(b => b.style === 'danger'),
  ];

  const renderButton = (button: ActionBarButtonSpec) => {
    const statusDisabled = isStatusDisabled(button);
    const disabled = statusDisabled || (runningKey !== null && runningKey !== button.key);
    const title = statusDisabled
      ? button.requires_admin && !viewerIsAdmin
        ? 'Only workspace admins can do this.'
        : button.disabled_reason ||
          button.confirm_message ||
          `"${button.label}" is disabled for this record's current status.`
      : undefined;
    if (button.options?.length) {
      return (
        <span key={button.key} title={title}>
          <ActionBarDropdownButton
            button={button}
            running={runningKey === button.key}
            disabled={disabled}
            onSelect={value => run(button, { [button.option_param || 'format']: value })}
          />
        </span>
      );
    }
    return (
      <Button
        key={button.key}
        variant={button.style || 'secondary'}
        size="sm"
        loading={runningKey === button.key}
        disabled={disabled}
        title={title}
        onClick={() => run(button)}
      >
        {button.label}
      </Button>
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="action-bar-widget">
      <div className="flex flex-wrap items-center gap-2">{mainButtons.map(renderButton)}</div>
      {dangerButtons.length > 0 && (
        <div className="ml-auto flex flex-wrap items-center gap-2">{dangerButtons.map(renderButton)}</div>
      )}
    </div>
  );
}
