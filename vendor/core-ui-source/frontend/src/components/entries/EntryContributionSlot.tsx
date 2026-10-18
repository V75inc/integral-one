import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Surface } from '../../ui';
import { trackViewsApi } from '../../api';
import { extensionsApi } from '../../api/extensions';
import { TRACK_VIEWS_STALE_MS } from '../../hooks/useTrackViews';
import { viewsForTrackQueryKey } from '../../queryKeys';
import { useScope } from '../../context/ScopeContext';
import type { OperationalModelFormSchema } from '../../types';
import {
  AppExtensionViewHost,
  type AppExtensionViewHostHandle,
} from '../extensions/AppExtensionViewHost';
import type {
  ContributionLifecycleApi,
  ContributionLifecycleHandle,
} from './contributionLifecycle';
import { NativeContributionHost } from './NativeContributionHost';

export type EntryContributionPlacement = 'entry_compose' | 'entry_detail';

export type EntryContributionUiContribution = {
  placement: string;
  /** ADR-011 iframe extension view key (exclusive with view/view_type). */
  extension_view_key?: string;
  /** Saved view key on the host track (Core region). */
  view?: string;
  /** Inline Core view_type when no saved view key is used. */
  view_type?: string;
  config?: Record<string, unknown>;
  layout?: string;
  /** When true, EntryForm hides the default field grid; contribution owns the body. */
  owns_form?: boolean;
  /** Ordered custom_field keys used to derive entry title when owns_form hides the title input. */
  title_from_fields?: string[];
};

export type EntryContributionSlotProps = {
  placement: EntryContributionPlacement;
  appId?: string;
  formSchema?:
    | { ui_contributions?: EntryContributionUiContribution[] }
    | OperationalModelFormSchema
    | null;
  trackId?: string;
  entryId?: string;
  entryTypeKey?: string;
  mode?: 'create' | 'edit' | 'detail';
  customFields?: Record<string, unknown>;
  onDraftPatch?: (patch: {
    custom_fields?: Record<string, unknown>;
    related?: unknown;
  }) => void;
  className?: string;
};

export type EntryContributionSlotHandle = {
  requestValidate: () => Promise<{
    ok: boolean;
    error?: string;
    field_errors?: Record<string, string>;
  }>;
  requestSubmit: (entryId?: string | null) => Promise<{
    ok: boolean;
    error?: string;
    value?: unknown;
    outcomeRecorded?: boolean;
  }>;
  notifyCommitted: (entryId: string, mode?: 'create' | 'edit') => void;
  hasContribution: boolean;
};

function isNativeContribution(c: EntryContributionUiContribution): boolean {
  return Boolean(c.view || c.view_type);
}

function isExtensionContribution(c: EntryContributionUiContribution): boolean {
  return Boolean(c.extension_view_key);
}

export function resolveEntryContribution(
  formSchema: EntryContributionSlotProps['formSchema'],
  placement: EntryContributionPlacement,
): EntryContributionUiContribution | null {
  const list = formSchema?.ui_contributions;
  if (!Array.isArray(list) || list.length === 0) return null;
  const match = list.find(c => c.placement === placement);
  if (!match) return null;
  if (!isExtensionContribution(match) && !isNativeContribution(match)) return null;
  return match;
}

/** True when the placement contribution takes over the EntryForm field grid. */
export function contributionOwnsForm(
  formSchema: EntryContributionSlotProps['formSchema'],
  placement: EntryContributionPlacement,
): boolean {
  return Boolean(resolveEntryContribution(formSchema, placement)?.owns_form);
}

/** Ordered field keys for deriving a title when owns_form hides the title input. */
export function contributionTitleFromFields(
  formSchema: EntryContributionSlotProps['formSchema'],
  placement: EntryContributionPlacement,
): string[] {
  const raw = resolveEntryContribution(formSchema, placement)?.title_from_fields;
  if (!Array.isArray(raw)) return [];
  return raw.map(k => String(k).trim()).filter(Boolean);
}

/** First non-empty value among ``keys`` in ``fieldValues`` (stringified). */
export function deriveTitleFromFields(
  fieldValues: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const v = fieldValues[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

export const EntryContributionSlot = forwardRef<
  EntryContributionSlotHandle,
  EntryContributionSlotProps
>(function EntryContributionSlot(props, ref) {
  const {
    placement,
    appId,
    formSchema,
    trackId,
    entryId,
    entryTypeKey,
    mode = 'detail',
    customFields,
    onDraftPatch,
    className,
  } = props;

  const contribution = useMemo(
    () => resolveEntryContribution(formSchema, placement),
    [formSchema, placement],
  );
  const native = contribution ? isNativeContribution(contribution) : false;
  const extensionKey = contribution?.extension_view_key || '';
  const { scope } = useScope();
  const workspaceId = scope?.workspaceId ?? '';
  const [failed, setFailed] = useState(false);
  const hostRef = useRef<AppExtensionViewHostHandle>(null);
  const nativeHandleRef = useRef<ContributionLifecycleHandle | null>(null);

  const registerNative = useCallback((handle: ContributionLifecycleHandle) => {
    nativeHandleRef.current = handle;
    return () => {
      if (nativeHandleRef.current === handle) {
        nativeHandleRef.current = null;
      }
    };
  }, []);

  const nativeLifecycle = useMemo<ContributionLifecycleApi>(
    () => ({
      mode,
      placement,
      entryId,
      trackId,
      entryTypeKey,
      appId,
      customFields: customFields ?? {},
      onDraftPatch,
      register: registerNative,
    }),
    [
      mode,
      placement,
      entryId,
      trackId,
      entryTypeKey,
      appId,
      customFields,
      onDraftPatch,
      registerNative,
    ],
  );

  const queryClient = useQueryClient();
  useEffect(() => {
    if (!native || !trackId || !contribution?.view) return;
    void queryClient.prefetchQuery({
      queryKey: viewsForTrackQueryKey(trackId),
      queryFn: () => trackViewsApi.list(trackId),
      staleTime: TRACK_VIEWS_STALE_MS,
    });
  }, [native, trackId, contribution?.view, queryClient]);

  const handshakeQuery = useQuery({
    queryKey: ['extension-view-handshake', appId, extensionKey, workspaceId],
    queryFn: () => extensionsApi.handshake(appId!, extensionKey),
    enabled: Boolean(!native && appId && extensionKey && workspaceId),
    staleTime: 60_000,
    retry: false,
  });

  useImperativeHandle(
    ref,
    () => ({
      hasContribution: Boolean(
        contribution && (native ? Boolean(trackId) : Boolean(appId && extensionKey)),
      ),
      requestValidate: async () => {
        if (!contribution) return { ok: true };
        if (native) {
          if (!nativeHandleRef.current) return { ok: true };
          return nativeHandleRef.current.requestValidate();
        }
        if (!hostRef.current) return { ok: true };
        return hostRef.current.requestValidate();
      },
      requestSubmit: async committedEntryId => {
        if (!contribution) return { ok: true };
        if (native) {
          if (!nativeHandleRef.current) return { ok: true };
          return nativeHandleRef.current.requestSubmit(committedEntryId);
        }
        if (!hostRef.current) return { ok: true };
        return hostRef.current.requestSubmit(committedEntryId);
      },
      notifyCommitted: (committedEntryId, committedMode) => {
        if (!native) {
          hostRef.current?.notifyCommitted(committedEntryId, committedMode);
        }
      },
    }),
    [contribution, native, appId, extensionKey, trackId],
  );

  if (!contribution) {
    return null;
  }

  if (native) {
    if (!trackId) return null;
    return (
      <NativeContributionHost
        trackId={trackId}
        contribution={{
          view: contribution.view,
          view_type: contribution.view_type,
          config: contribution.config,
        }}
        lifecycle={nativeLifecycle}
        className={className}
        minHeight={placement === 'entry_compose' ? 280 : 240}
      />
    );
  }

  if (!appId || !extensionKey) {
    return null;
  }

  if (failed || handshakeQuery.isError) {
    return null;
  }

  if (handshakeQuery.isLoading || !handshakeQuery.data) {
    return (
      <Surface tone="panel-2" border="none" radius="card" className={className ?? 'min-h-[200px] animate-pulse'} />
    );
  }

  const hs = handshakeQuery.data;
  const draftContext = {
    placement,
    mode,
    trackId,
    entryId,
    entry_type_key: entryTypeKey,
    custom_fields: customFields ?? {},
    draft: {
      custom_fields: customFields ?? {},
      entry_id: entryId ?? null,
      entry_type_key: entryTypeKey,
      mode,
      track_id: trackId,
    },
    entries: entryId
      ? [{ id: entryId, custom_fields: customFields ?? {}, type: entryTypeKey }]
      : [],
  };

  return (
    <AppExtensionViewHost
      ref={hostRef}
      appId={appId}
      viewKey={extensionKey}
      workspaceId={workspaceId}
      handshakeToken={hs.handshake_token}
      packageVersion={hs.package_version}
      theme={hs.theme}
      context={draftContext}
      className={className}
      onDraftPatch={onDraftPatch}
      onError={() => setFailed(true)}
      minHeight={placement === 'entry_compose' ? 280 : 240}
    />
  );
});
