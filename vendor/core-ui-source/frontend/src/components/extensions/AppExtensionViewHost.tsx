import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import apiClient from '../../api/client';
import { extensionsApi, isRecordedOutputWithheld, RECORDED_OUTPUT_WITHHELD_MESSAGE } from '../../api/extensions';
import { Text } from '../../ui';
import {
  useExtensionBridge,
  type ExtensionBridgeApi,
  type ExtensionBridgeContext,
} from './useExtensionBridge';
import { EXTENSION_PROTOCOL } from './extensionProtocol';
import { ExtensionViewFallback } from './ExtensionViewFallback';
import { Skeleton } from '../ui';
import { useExtensionTheme } from './useExtensionTheme';

export interface AppExtensionViewHostProps {
  appId: string;
  viewKey: string;
  workspaceId: string;
  handshakeToken: string;
  packageVersion?: string;
  theme?: Record<string, unknown>;
  context?: Record<string, unknown>;
  className?: string;
  iframeClassName?: string;
  onError?: () => void;
  onDraftPatch?: (patch: {
    custom_fields?: Record<string, unknown>;
    related?: unknown;
  }) => void;
  minHeight?: number;
  /** Open one of the app's entries when the frame asks (the host page supplies routing). */
  onOpenEntry?: (entryId: string) => void;
  onNavigatePath?: (path: string) => void;
  onChanged?: () => void;
}

export type AppExtensionViewHostHandle = ExtensionBridgeApi;

export const AppExtensionViewHost = forwardRef<
  AppExtensionViewHostHandle,
  AppExtensionViewHostProps
>(function AppExtensionViewHost(
  {
    appId,
    viewKey,
    workspaceId,
    handshakeToken,
    packageVersion,
    theme,
    context,
    className,
    iframeClassName,
    onError,
    onDraftPatch,
    minHeight = 240,
    onOpenEntry,
    onNavigatePath,
    onChanged,
  },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const currentTheme = useExtensionTheme();
  const activeScope = useRef('');
  const onNavigatePathRef = useRef(onNavigatePath);
  useEffect(() => { onNavigatePathRef.current = onNavigatePath; }, [onNavigatePath]);
  const [failed, setFailed] = useState(false);
  const [recordedCompletion, setRecordedCompletion] = useState(false);
  // Do not relabel an already mounted grant when parent scope props change
  // before its replacement handshake arrives.
  const scopeKey = JSON.stringify([workspaceId, appId, viewKey]);
  const tokenScopeRef = useRef({ token: handshakeToken, scopeKey });
  if (tokenScopeRef.current.token !== handshakeToken) {
    tokenScopeRef.current = { token: handshakeToken, scopeKey };
  }
  const frameGrantMatches = tokenScopeRef.current.scopeKey === scopeKey;
  useLayoutEffect(() => { activeScope.current = JSON.stringify([scopeKey, handshakeToken]); return () => { activeScope.current = ''; }; }, [scopeKey, handshakeToken]);
  // A real sandbox document has its own hash-only CSP. srcDoc would inherit
  // Core's CSP and block the verified package's inline bridge script.
  const frameUrl = apiClient.getUri({
    url: '/extension-view-frame',
    params: { token: handshakeToken },
  });
  const [loadedToken, setLoadedToken] = useState<string | null>(null);
  const [frameHeight, setFrameHeight] = useState<number | 'fill'>(minHeight);
  // 'fill' tracks the window height so the view gets all the room there is.
  const [windowHeight, setWindowHeight] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  );
  useEffect(() => {
    if (frameHeight !== 'fill') return undefined;
    const onResize = () => setWindowHeight(window.innerHeight);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [frameHeight]);
  const loaded = loadedToken === handshakeToken;

  // Sandboxed iframes sometimes finish loading before React attaches onLoad,
  // which leaves the skeleton painted over a ready frame.
  useEffect(() => {
    if (!handshakeToken || loaded) return undefined;
    const timer = window.setTimeout(() => {
      setLoadedToken(handshakeToken);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [handshakeToken, loaded]);

  const bridge = useMemo<ExtensionBridgeContext>(
    () => ({
      workspaceId,
      appId,
      viewKey,
      handshakeToken,
      packageVersion,
      theme: { ...theme, ...currentTheme },
      context,
    }),
    [workspaceId, appId, viewKey, handshakeToken, packageVersion, theme, currentTheme, context],
  );

  const readHandler = useMemo(
    () => (path: string, ctx: ExtensionBridgeContext) => {
      if (path === 'entries.count') {
        const entries = ctx.context?.entries;
        return Array.isArray(entries) ? entries.length : 0;
      }
      if (path === 'context.primary_entry') {
        const entries = ctx.context?.entries;
        if (Array.isArray(entries) && entries.length > 0) {
          return entries[0];
        }
        return null;
      }
      if (path === 'props') return ctx.context?.props ?? {};
      if (path === 'theme') return ctx.theme ?? {};
      if (path === 'context') {
        return ctx.context ?? {};
      }
      if (path === 'draft' || path === 'draft.snapshot') {
        return ctx.context?.draft ?? ctx.context ?? {};
      }
      return null;
    },
    [],
  );

  const operationHandler = useCallback(
    async (
      operationKey: string,
      payload: Record<string, unknown>,
      ctx: ExtensionBridgeContext,
      idempotencyKey?: string,
    ) => {
      if (ctx.context?.preview) return Promise.reject(new Error('Business actions are disabled in previews.'));
      return extensionsApi.invokeOperation(
        ctx.appId,
        operationKey,
        payload,
        idempotencyKey,
      );
    },
    [],
  );

  const capabilitiesHandler = useCallback(
    async (ctx: ExtensionBridgeContext) => {
      const snap = await extensionsApi.listCapabilities(true);
      const filtered = (snap.capabilities || []).filter(
        (c) => !c.app_id || c.app_id === ctx.appId || c.namespace === 'integral',
      );
      return { ...snap, capabilities: filtered };
    },
    [],
  );

  const queryHandler = useCallback(
    async (
      capabilityKey: string,
      params: Record<string, unknown>,
      ctx: ExtensionBridgeContext,
    ) => ctx.context?.preview && !ctx.context?.liveData
      ? Promise.reject(new Error('Live data is disabled in this preview.'))
      : extensionsApi.invokeQuery(ctx.appId, capabilityKey, params),
    [],
  );

  const bridgeApi = useExtensionBridge(
    iframeRef,
    bridge,
    readHandler,
    operationHandler,
    capabilitiesHandler,
    queryHandler,
    onDraftPatch,
    (height) => setFrameHeight(Math.max(minHeight, height)),
    {
      // A frame may ask for more room (kept within sane bounds) or to open one of its entries.
      onResize: height =>
        setFrameHeight(height === 'fill' ? 'fill' : Math.min(Math.max(Math.round(height), minHeight), 2400)),
      onNavigate: entryId => onOpenEntry?.(entryId),
      onOperationResult: value => {
        const withheld = isRecordedOutputWithheld(value);
        setRecordedCompletion(withheld);
        if (!withheld) onChanged?.();
      },
      onNavigation: async (target, ctx) => {
        const signature = JSON.stringify([JSON.stringify([ctx.workspaceId, ctx.appId, ctx.viewKey]), ctx.handshakeToken]);
        if (ctx.context?.preview) throw new Error('Navigation is disabled in previews.');
        const result = await extensionsApi.resolveNavigation(ctx.appId, target);
        if (activeScope.current !== signature) throw new Error('View changed.');
        if (onNavigatePathRef.current) onNavigatePathRef.current(result.path);
        else window.location.assign(result.path);
        return result;
      },
    },
  );

  useImperativeHandle(ref, () => bridgeApi, [bridgeApi]);
  useEffect(() => { bridgeApi.sendHandshake(); }, [bridgeApi.sendHandshake, context, currentTheme]);

  // Entry hydration may finish after the iframe's initial ready handshake.
  // Notify the mounted view to reread through the now-current bridge context.
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { protocol: EXTENSION_PROTOCOL, type: 'refresh' },
      '*',
    );
  }, [context]);

  useEffect(() => {
    setFailed(false);
    setRecordedCompletion(false);
  }, [handshakeToken, workspaceId, appId, viewKey]);

  if (failed) {
    return <ExtensionViewFallback />;
  }

  return (
    <div
      className={className ?? 'relative w-full'}
      style={{ minHeight: frameHeight === 'fill' ? Math.max(windowHeight - 96, 480) : frameHeight }}
    >
      {recordedCompletion && frameGrantMatches ? (
        <div role="status" className="mb-2 px-3 py-2">
          <Text as="p" variant="body-sm" tone="info">{RECORDED_OUTPUT_WITHHELD_MESSAGE}</Text>
        </div>
      ) : null}
      {!loaded || !frameGrantMatches ? (
        <div className="absolute inset-0 flex items-center justify-center" style={{ minHeight }}>
          <Skeleton className="h-full w-full min-h-[240px]" />
        </div>
      ) : null}
      {handshakeToken && frameGrantMatches ? (
        <iframe
          key={handshakeToken}
          ref={bridgeApi.bindFrame}
          title={`App extension view ${viewKey}`}
          src={frameUrl}
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedToken(handshakeToken)}
          sandbox="allow-scripts"
          className={
            iframeClassName ??
            'w-full border border-[var(--panel-border)] rounded-[var(--radius-card)] bg-[var(--bg)]'
          }
          style={
            iframeClassName
              ? { height: frameHeight, minHeight }
              : frameHeight === 'fill'
                ? { height: Math.max(windowHeight - 96, 480), minHeight }
                : { height: frameHeight, minHeight }
          }
          onError={() => {
            setFailed(true);
            onError?.();
          }}
        />
      ) : null}
    </div>
  );
});
