import { useMemo, useState } from 'react';
import { Surface } from '../../ui';
import { useQuery } from '@tanstack/react-query';
import { extensionsApi } from '../../api/extensions';
import { useScope } from '../../context/ScopeContext';
import { useNavigate } from 'react-router-dom';
import { useContributionLifecycle } from '../entries/contributionLifecycle';
import { Button } from '../ui';
import { AppExtensionViewHost } from '../extensions/AppExtensionViewHost';
import { ExtensionViewFallback } from '../extensions/ExtensionViewFallback';
import {
  EXTENSION_VIEW_TEMPLATE_EDITOR_IFRAME_CLASS,
  EXTENSION_VIEW_TEMPLATE_EDITOR_MIN_HEIGHT,
  EXTENSION_VIEW_TEMPLATE_EDITOR_SHELL_CLASS,
} from '../extensions/extensionViewLayout';
import type { ViewWidgetProps } from '../../views/types';

/**
 * Optional ``config.min_height`` (px) lets a compact App view shrink below the
 * host's default frame height. Clamped to a sane range; absent means default.
 */
function configuredMinHeight(view: ViewWidgetProps['view']): number | undefined {
  const raw = (view.config || {}) as { min_height?: unknown };
  const n = Number(raw.min_height);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.max(Math.round(n), 48), 2400);
}

function resolveExtensionViewKey(view: ViewWidgetProps['view']): string {
  const cfg = (view.config || {}) as { extension_view_key?: string };
  const top = (view as { extension_view_key?: string }).extension_view_key;
  return String(top || cfg.extension_view_key || '').trim();
}

type ContributionBindings = {
  appId?: string;
  trackId?: string;
  entryId?: string;
  entryValues?: Record<string, unknown>;
  __contributionMode?: string;
  __contributionPlacement?: string;
  entry_type_key?: string;
};

/**
 * Resolve app id for nested document-shell regions.
 *
 * ``ComposableViewSlot`` / ``NativeContributionHost`` often omit the ``track``
 * prop, so ``track.app.id`` is empty inside layout_container children. Hosts
 * already forward ``appId`` on ``view.config.__bindings`` (see
 * NativeContributionHost) — prefer that fallback.
 */
function resolveAppId(
  track: ViewWidgetProps['track'],
  bindings: ContributionBindings,
): string {
  return String(track?.app?.id || bindings.appId || '').trim();
}

export function ExtensionViewWidget(props: ViewWidgetProps) {
  const bindings = ((props.view.config || {}) as { __bindings?: ContributionBindings }).__bindings || {};
  const appId = resolveAppId(props.track, bindings);
  const viewKey = resolveExtensionViewKey(props.view);
  const { scope } = useScope();
  const workspaceId = scope?.workspaceId ?? '';
  // A host failure belongs to one authorized mount. A different App, view or
  // workspace starts a new session, including iframe state and error handling.
  const identity = JSON.stringify([appId, viewKey, workspaceId]);
  return <ExtensionViewSession key={identity} {...props} appId={appId} viewKey={viewKey} workspaceId={workspaceId} />;
}

function ExtensionViewSession({
  view, entries, track, appId, viewKey, workspaceId,
}: ViewWidgetProps & { appId: string; viewKey: string; workspaceId: string }) {
  const bindings = ((view.config || {}) as { __bindings?: ContributionBindings }).__bindings || {};
  const lifecycle = useContributionLifecycle();
  const trackId = String(
    track?.id || bindings.trackId || lifecycle?.trackId || view.track_id || '',
  ).trim();
  const entryId = String(
    bindings.entryId ||
      lifecycle?.entryId ||
      (entries[0] && entries[0].id) ||
      '',
  ).trim();
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const navigate = useNavigate();
  // Prefer live lifecycle values (updated by sibling form regions) over the
  // snapshot frozen into __bindings when the host first mounted.
  const entryValues =
    (lifecycle?.customFields && Object.keys(lifecycle.customFields).length
      ? lifecycle.customFields
      : null) ||
    bindings.entryValues ||
    {};

  const hostContext = useMemo(
    () => ({
      entries,
      trackId,
      track_id: trackId,
      entryId: entryId || null,
      entry_id: entryId || null,
      entry_type_key: bindings.entry_type_key,
      mode: bindings.__contributionMode || 'detail',
      placement: bindings.__contributionPlacement,
      custom_fields: entryValues,
      draft: {
        custom_fields: entryValues,
        related: {},
      },
      viewKey,
    }),
    [
      entries,
      trackId,
      entryId,
      bindings.entry_type_key,
      bindings.__contributionMode,
      bindings.__contributionPlacement,
      entryValues,
      viewKey,
    ],
  );

  const handshakeQuery = useQuery({
    queryKey: ['extension-view-handshake', appId, viewKey, workspaceId],
    queryFn: () => extensionsApi.handshake(appId, viewKey),
    enabled: Boolean(appId && viewKey && workspaceId),
    staleTime: 60_000,
    retry: false,
  });

  if (!appId || !viewKey) {
    return (
      <ExtensionViewFallback
        message="This extension view is missing app or view key metadata."
      />
    );
  }

  if ((failed || handshakeQuery.isError) && !retrying) {
    return <ExtensionViewFallback action={
      <Button size="sm" variant="outline" onClick={async () => {
        setRetrying(true);
        try {
          const result = await handshakeQuery.refetch();
          if (!result.isError) setFailed(false);
        } finally {
          setRetrying(false);
        }
      }}>Retry view</Button>
    } />;
  }

  if (retrying || handshakeQuery.isLoading || !handshakeQuery.data) {
    return (
      <Surface tone="panel-2" border="none" radius="card" className="min-h-[240px] animate-pulse" />
    );
  }

  const hs = handshakeQuery.data;
  const isTemplateEditor = viewKey === 'template_editor';
  return (
    <AppExtensionViewHost
      key={hs.handshake_token}
      appId={appId}
      viewKey={viewKey}
      workspaceId={workspaceId}
      handshakeToken={hs.handshake_token}
      packageVersion={hs.package_version}
      theme={hs.theme}
      context={hostContext}
      onDraftPatch={lifecycle?.onDraftPatch}
      onError={() => setFailed(true)}
      onOpenEntry={entryId => navigate(`/entries/${encodeURIComponent(entryId)}`)}
      onNavigatePath={path => navigate(path)}
      className={
        isTemplateEditor ? EXTENSION_VIEW_TEMPLATE_EDITOR_SHELL_CLASS : undefined
      }
      iframeClassName={
        isTemplateEditor ? EXTENSION_VIEW_TEMPLATE_EDITOR_IFRAME_CLASS : undefined
      }
      minHeight={
        isTemplateEditor ? EXTENSION_VIEW_TEMPLATE_EDITOR_MIN_HEIGHT : configuredMinHeight(view)
      }
    />
  );
}
