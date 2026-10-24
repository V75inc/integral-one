export const EXTENSION_PROTOCOL = 'integral.extension.v1';

export type ExtensionBridgeMessage =
  | { protocol: typeof EXTENSION_PROTOCOL; type: 'navigation'; requestId: string; target: { kind: 'app' | 'track' | 'entry' | 'dashboard'; id: string } }
  | { protocol: typeof EXTENSION_PROTOCOL; type: 'navigation.result'; requestId: string; ok: boolean; value?: unknown; error?: string; error_code?: string }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'handshake';
      token: string;
      workspaceId: string;
      appId: string;
      viewKey: string;
      packageVersion?: string;
      theme?: Record<string, unknown>;
      context?: Record<string, unknown>;
    }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'ready';
    }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'read';
      requestId: string;
      path: string;
    }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'read.result';
      requestId: string;
      ok: boolean;
      value?: unknown;
      error?: string;
    }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'operation';
      requestId: string;
      operationKey: string;
      /** Durable operation retry identity shared by all authorized transports. */
      idempotencyKey?: string;
      payload?: Record<string, unknown>;
    }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'operation.result';
      requestId: string;
      ok: boolean;
      value?: unknown;
      error?: string;
      error_code?: string;
      retryable?: boolean;
      outcome?: 'unconfirmed';
    }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'capabilities';
      requestId: string;
    }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'capabilities.result';
      requestId: string;
      ok: boolean;
      value?: unknown;
      error?: string;
    }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'query';
      requestId: string;
      capabilityKey: string;
      params?: Record<string, unknown>;
    }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'query.result';
      requestId: string;
      ok: boolean;
      value?: unknown;
      error?: string;
    }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'refresh';
    }
  | {
      /** Frame -> host: ask for a taller frame (the host bounds it), or ``'fill'``
       *  for the full height of the window so the view can scroll its own panes. */
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'resize';
      height: number | 'fill';
    }
  | {
      /** Frame -> host: open one of the app's entries on its own page. */
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'navigate';
      entryId: string;
    }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'lifecycle';
      state: 'paused' | 'unavailable' | 'active';
    }
  /** Iframe → host: merge draft custom_fields / related payloads into the parent form. */
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'draft.patch';
      custom_fields?: Record<string, unknown>;
      related?: unknown;
    }
  /** Iframe → host: request iframe height (px) for the host slot. */
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'ui.resize';
      height: number;
    }
  /** Host → iframe: ask the contribution to validate before parent save. */
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'draft.validate';
      requestId: string;
    }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'draft.validate.result';
      requestId: string;
      ok: boolean;
      error?: string;
      field_errors?: Record<string, string>;
    }
  /** Host → iframe: parent is saving; iframe may prepare related drafts (entry_id optional on create). */
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'draft.submit';
      requestId: string;
      entry_id?: string | null;
    }
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'draft.submit.result';
      requestId: string;
      ok: boolean;
      error?: string;
      value?: unknown;
    }
  /** Host → iframe: parent entry was created/updated; iframe may persist related rows via operations. */
  | {
      protocol: typeof EXTENSION_PROTOCOL;
      type: 'draft.committed';
      entry_id: string;
      mode?: 'create' | 'edit';
    };

export function isExtensionMessage(data: unknown): data is ExtensionBridgeMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as ExtensionBridgeMessage;
  return msg.protocol === EXTENSION_PROTOCOL && typeof msg.type === 'string';
}
