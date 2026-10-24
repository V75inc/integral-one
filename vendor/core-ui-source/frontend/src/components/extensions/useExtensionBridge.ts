import { isAxiosError } from 'axios';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ExtensionNavigationTarget } from '../../api/extensions';
import { isRecordedOutputWithheld, RECORDED_OUTPUT_WITHHELD_MESSAGE } from '../../api/extensions';
import {
  EXTENSION_PROTOCOL,
  isExtensionMessage,
  type ExtensionBridgeMessage,
} from './extensionProtocol';

const UNCONFIRMED_VIEW_RESULT = 'The view changed or closed before its result was received. Check the original record before retrying.';

export type ExtensionBridgeContext = {
  workspaceId: string;
  appId: string;
  viewKey: string;
  handshakeToken: string;
  packageVersion?: string;
  theme?: Record<string, unknown>;
  /** Optional host context for read handlers (e.g. entry id). */
  context?: Record<string, unknown>;
};

type ReadHandler = (path: string, ctx: ExtensionBridgeContext) => unknown;
type OperationHandler = (
  operationKey: string,
  payload: Record<string, unknown>,
  ctx: ExtensionBridgeContext,
  idempotencyKey?: string,
) => Promise<unknown>;
type CapabilitiesHandler = (ctx: ExtensionBridgeContext) => Promise<unknown>;
type QueryHandler = (
  capabilityKey: string,
  params: Record<string, unknown>,
  ctx: ExtensionBridgeContext,
) => Promise<unknown>;

/** Things a frame may ask the host to do to the page around it. */
export type ExtensionHostActions = {
  onResize?: (height: number | 'fill') => void;
  onNavigate?: (entryId: string) => void;
  onOperationResult?: (value: unknown) => void;
  onNavigation?: (target: ExtensionNavigationTarget, context: ExtensionBridgeContext) => Promise<{ path: string }>;
};

export type DraftPatchHandler = (patch: {
  custom_fields?: Record<string, unknown>;
  related?: unknown;
}) => void;

export type UiResizeHandler = (height: number) => void;

type PendingRequest = {
  channel: object;
  resolve: (value: {
    ok: boolean;
    error?: string;
    field_errors?: Record<string, string>;
    value?: unknown;
  }) => void;
  kind: 'validate' | 'submit';
};

export type ExtensionBridgeApi = {
  sendHandshake: () => void;
  postToChild: (message: ExtensionBridgeMessage) => void;
  requestValidate: () => Promise<{
    ok: boolean;
    error?: string;
    field_errors?: Record<string, string>;
  }>;
  requestSubmit: (entryId?: string | null) => Promise<{
    ok: boolean;
    error?: string;
    value?: unknown;
  }>;
  notifyCommitted: (entryId: string, mode?: 'create' | 'edit') => void;
};

function newRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useExtensionBridge(
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>,
  bridge: ExtensionBridgeContext | null,
  readHandler?: ReadHandler,
  operationHandler?: OperationHandler,
  capabilitiesHandler?: CapabilitiesHandler,
  queryHandler?: QueryHandler,
  draftPatchHandler?: DraftPatchHandler,
  uiResizeHandler?: UiResizeHandler,
  hostActions?: ExtensionHostActions,
): ExtensionBridgeApi & { bindFrame: React.RefCallback<HTMLIFrameElement> } {
  const actionsRef = useRef(hostActions);
  const bridgeRef = useRef(bridge);
  // Bind asynchronous replies to the receiving sandbox and security context.
  // Draft/context edits keep the channel; a scope/token switch replaces it.
  const signature = bridge ? JSON.stringify([
    bridge.workspaceId, bridge.appId, bridge.viewKey, bridge.handshakeToken,
  ]) : '';
  const channel = useMemo(() => ({ signature }), [signature]);
  const channelRef = useRef(channel);
  // Publish only committed scope and handlers. An abandoned concurrent render
  // must not relabel the active frame or redirect an in-flight reply.
  useLayoutEffect(() => {
    actionsRef.current = hostActions;
    bridgeRef.current = bridge;
    channelRef.current = channel;
  }, [hostActions, bridge, channel]);
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
  const frameBindingRef = useRef<{ node: HTMLIFrameElement; channel: object } | null>(null);
  const bindFrame = useCallback((node: HTMLIFrameElement | null) => {
    if (!node) {
      for (const pending of pendingRef.current.values()) {
        pending.resolve({ ok: false, error: UNCONFIRMED_VIEW_RESULT });
      }
      pendingRef.current.clear();
    }
    iframeRef.current = node;
    frameBindingRef.current = node ? { node, channel } : null;
  }, [iframeRef, channel]);

  useEffect(() => {
    const pendingRequests = pendingRef.current;
    return () => {
      for (const [id, pending] of pendingRequests) {
        if (pending.channel !== channel) continue;
        pendingRequests.delete(id);
        pending.resolve({ ok: false, error: UNCONFIRMED_VIEW_RESULT });
      }
    };
  }, [channel]);

  const postToChild = useCallback((message: ExtensionBridgeMessage) => {
    if (channelRef.current !== channel || frameBindingRef.current?.channel !== channel ||
      frameBindingRef.current.node !== iframeRef.current) return false;
    const win = iframeRef.current?.contentWindow;
    if (!win) return false;
    win.postMessage(message, '*');
    return true;
  }, [iframeRef, channel]);

  const sendHandshake = useCallback(() => {
    const current = bridgeRef.current;
    if (!current) return;
    postToChild({
      protocol: EXTENSION_PROTOCOL,
      type: 'handshake',
      token: current.handshakeToken,
      workspaceId: current.workspaceId,
      appId: current.appId,
      viewKey: current.viewKey,
      packageVersion: current.packageVersion,
      theme: current.theme,
      context: current.context,
    });
  }, [postToChild]);

  const requestValidate = useCallback(() => {
    return new Promise<{
      ok: boolean;
      error?: string;
      field_errors?: Record<string, string>;
    }>((resolve) => {
      const requestId = newRequestId('validate');
      pendingRef.current.set(requestId, {
        channel,
        kind: 'validate',
        resolve: (value) =>
          resolve({
            ok: value.ok,
            error: value.error,
            field_errors: value.field_errors,
          }),
      });
      if (!postToChild({
        protocol: EXTENSION_PROTOCOL,
        type: 'draft.validate',
        requestId,
      })) {
        pendingRef.current.delete(requestId);
        resolve({ ok: false, error: 'The view is no longer active.' });
        return;
      }
      // If the iframe ignores draft messages, do not block forever.
      window.setTimeout(() => {
        const pending = pendingRef.current.get(requestId);
        if (!pending) return;
        pendingRef.current.delete(requestId);
        resolve({ ok: true });
      }, 4000);
    });
  }, [postToChild, channel]);

  const requestSubmit = useCallback(
    (entryId?: string | null) => {
      return new Promise<{
        ok: boolean;
        error?: string;
        value?: unknown;
      }>((resolve) => {
        const requestId = newRequestId('submit');
        pendingRef.current.set(requestId, {
          channel,
          kind: 'submit',
          resolve: (value) =>
            resolve({
              ok: value.ok,
              error: value.error,
              value: value.value,
            }),
        });
        if (!postToChild({
          protocol: EXTENSION_PROTOCOL,
          type: 'draft.submit',
          requestId,
          entry_id: entryId ?? null,
        })) {
          pendingRef.current.delete(requestId);
          resolve({ ok: false, error: 'The view is no longer active.' });
          return;
        }
        window.setTimeout(() => {
          const pending = pendingRef.current.get(requestId);
          if (!pending) return;
          pendingRef.current.delete(requestId);
          resolve({ ok: true });
        }, 8000);
      });
    },
    [postToChild, channel],
  );

  const notifyCommitted = useCallback(
    (entryId: string, mode?: 'create' | 'edit') => {
      postToChild({
        protocol: EXTENSION_PROTOCOL,
        type: 'draft.committed',
        entry_id: entryId,
        mode,
      });
    },
    [postToChild],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const iframeWin = iframeRef.current?.contentWindow;
      if (!iframeWin || event.source !== iframeWin) return;
      const frameBinding = frameBindingRef.current;
      if (!frameBinding || frameBinding.node !== iframeRef.current ||
        frameBinding.channel !== channelRef.current) return;
      if (!isExtensionMessage(event.data)) return;
      const msg = event.data;
      const current = bridgeRef.current;
      if (!current) return;
      const channel = channelRef.current;
      const currentReply = () => channelRef.current === channel &&
        frameBindingRef.current === frameBinding &&
        iframeRef.current?.contentWindow === iframeWin;
      const reply = (message: ExtensionBridgeMessage) => {
        if (currentReply()) postToChild(message);
      };

      if (msg.type === 'ready') {
        sendHandshake();
        return;
      }

      if (msg.type === 'resize') {
        if (msg.height === 'fill') {
          actionsRef.current?.onResize?.('fill');
          return;
        }
        const height = Number(msg.height);
        if (Number.isFinite(height)) actionsRef.current?.onResize?.(height);
        return;
      }

      if (msg.type === 'navigation') {
        const handler = actionsRef.current?.onNavigation;
        if (!handler || !msg.target || !['app', 'track', 'entry', 'dashboard'].includes(msg.target.kind)
          || typeof msg.target.id !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(msg.target.id)) {
          reply({ protocol: EXTENSION_PROTOCOL, type: 'navigation.result', requestId: msg.requestId, ok: false, error: 'Destination unavailable', error_code: 'navigation_unavailable' });
          return;
        }
        void handler(msg.target, current).then(value => reply({ protocol: EXTENSION_PROTOCOL, type: 'navigation.result', requestId: msg.requestId, ok: true, value }))
          .catch(() => reply({ protocol: EXTENSION_PROTOCOL, type: 'navigation.result', requestId: msg.requestId, ok: false, error: 'Destination unavailable', error_code: 'navigation_unavailable' }));
        return;
      }

      if (msg.type === 'navigate') {
        // Only a plain entry id: never a path or URL a frame could steer the page with.
        const entryId = String(msg.entryId || '');
        if (/^[A-Za-z0-9_.-]{1,128}$/.test(entryId)) actionsRef.current?.onNavigate?.(entryId);
        return;
      }

      if (msg.type === 'draft.patch') {
        draftPatchHandler?.({
          custom_fields: msg.custom_fields,
          related: msg.related,
        });
        return;
      }

      if (msg.type === 'ui.resize') {
        if (typeof msg.height === 'number' && Number.isFinite(msg.height)) {
          uiResizeHandler?.(Math.max(0, msg.height));
        }
        return;
      }

      if (msg.type === 'draft.validate.result' || msg.type === 'draft.submit.result') {
        const pending = pendingRef.current.get(msg.requestId);
        if (!pending || pending.channel !== channelRef.current) return;
        pendingRef.current.delete(msg.requestId);
        pending.resolve({
          ok: Boolean(msg.ok),
          error: msg.error,
          field_errors:
            msg.type === 'draft.validate.result' ? msg.field_errors : undefined,
          value: msg.type === 'draft.submit.result' ? msg.value : undefined,
        });
        return;
      }

      if (msg.type === 'read' && readHandler) {
        let value: unknown;
        let ok = true;
        let error: string | undefined;
        try {
          value = readHandler(msg.path, current);
        } catch (err) {
          ok = false;
          error = err instanceof Error ? err.message : 'read failed';
        }
        reply({
          protocol: EXTENSION_PROTOCOL,
          type: 'read.result',
          requestId: msg.requestId,
          ok,
          value,
          error,
        });
        return;
      }

      if (msg.type === 'operation' && operationHandler) {
        void (async () => {
          let value: unknown;
          let ok = true;
          let error: string | undefined;
          let failure: { error_code?: string; retryable?: boolean; outcome?: 'unconfirmed' } = {};
          let withheld = false;
          try {
            value = await operationHandler(
              msg.operationKey,
              msg.payload ?? {},
              current,
              msg.idempotencyKey,
            );
            if (!currentReply()) return;
            withheld = isRecordedOutputWithheld(value);
            if (withheld) {
              ok = false;
              error = RECORDED_OUTPUT_WITHHELD_MESSAGE;
            }
          } catch (err) {
            ok = false;
            error = err instanceof Error ? err.message : 'operation failed';
            if (isAxiosError(err)) {
              const data = err.response?.data as { error_code?: unknown; message?: unknown; retryable?: unknown } | undefined;
              error = typeof data?.message === 'string' ? data.message : 'Operation result could not be confirmed. Check current state before retrying.';
              const unconfirmed = !err.response || err.response.status >= 500 || err.response.status === 408;
              failure = {
                error_code: typeof data?.error_code === 'string' ? data.error_code : unconfirmed ? 'operation_unconfirmed' : 'operation_failed',
                retryable: false,
                ...(unconfirmed ? { outcome: 'unconfirmed' as const } : {}),
              };
            }
          }
          if (!currentReply()) return;
          if (ok || withheld) actionsRef.current?.onOperationResult?.(value);
          reply({
            protocol: EXTENSION_PROTOCOL,
            type: 'operation.result',
            requestId: msg.requestId,
            ok,
            value,
            error,
            ...failure,
            ...(withheld ? { error_code: 'operation_output_withheld', retryable: false } : {}),
          });
        })();
        return;
      }

      if (msg.type === 'capabilities' && capabilitiesHandler) {
        void (async () => {
          let value: unknown;
          let ok = true;
          let error: string | undefined;
          try {
            value = await capabilitiesHandler(current);
          } catch (err) {
            ok = false;
            error = err instanceof Error ? err.message : 'capabilities failed';
          }
          reply({
            protocol: EXTENSION_PROTOCOL,
            type: 'capabilities.result',
            requestId: msg.requestId,
            ok,
            value,
            error,
          });
        })();
        return;
      }

      if (msg.type === 'query' && queryHandler) {
        void (async () => {
          let value: unknown;
          let ok = true;
          let error: string | undefined;
          try {
            value = await queryHandler(
              msg.capabilityKey,
              msg.params ?? {},
              current,
            );
          } catch (err) {
            ok = false;
            error = err instanceof Error ? err.message : 'query failed';
          }
          reply({
            protocol: EXTENSION_PROTOCOL,
            type: 'query.result',
            requestId: msg.requestId,
            ok,
            value,
            error,
          });
        })();
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [
    iframeRef,
    postToChild,
    readHandler,
    operationHandler,
    capabilitiesHandler,
    queryHandler,
    draftPatchHandler,
    uiResizeHandler,
    sendHandshake,
  ]);

  return {
    bindFrame,
    sendHandshake,
    postToChild,
    requestValidate,
    requestSubmit,
    notifyCommitted,
  };
}
