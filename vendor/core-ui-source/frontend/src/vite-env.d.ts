/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_BACKEND_URL?: string;
  /** Set to "0" / "false" to hide the Universal View Designer entry points. */
  readonly VITE_VIEW_DESIGNER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
