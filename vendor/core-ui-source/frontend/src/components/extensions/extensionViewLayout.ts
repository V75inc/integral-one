/**
 * Shared sizing for sandboxed extension_view iframes (e.g. Email Log mail log panel).
 * Uses explicit height so the iframe is not stuck at the browser default (~150px).
 */
export const EXTENSION_VIEW_SHELL_CLASS =
  'relative w-full h-[calc(100dvh-var(--app-topbar-height)-var(--system-bar-h,0px)-11rem)] min-h-[32rem]';

export const EXTENSION_VIEW_IFRAME_CLASS =
  'w-full h-full min-h-[32rem] border border-[var(--panel-border)] rounded-[var(--radius-card)] bg-[var(--bg)]';

/** Document Templates TipTap editor — tall viewport within the main column (no negative horizontal bleed). */
export const EXTENSION_VIEW_TEMPLATE_EDITOR_SHELL_CLASS =
  'relative w-full min-w-0 max-w-full overflow-hidden ' +
  'h-[calc(100dvh-var(--app-topbar-height)-var(--system-bar-h,0px)-9rem)] min-h-[36rem]';

export const EXTENSION_VIEW_TEMPLATE_EDITOR_IFRAME_CLASS =
  'w-full h-full min-h-[36rem] border-0 rounded-none bg-[var(--bg)]';

export const EXTENSION_VIEW_TEMPLATE_EDITOR_MIN_HEIGHT = 720;
