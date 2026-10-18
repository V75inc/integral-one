import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { integralAppPublicPages } from './plugins/integralAppPublicPages';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_BACKEND_URL || 'http://localhost:4000';
  const appPublicPaths =
    env.VITE_INTEGRAL_APP_PUBLIC_PATHS || env.INTEGRAL_APP_PUBLIC_PATHS || '';
  const nodeEnv = mode === 'production' ? 'production' : 'development';
  // Keep in lockstep with backend INTEGRAL_WEB_ASSET_VERSION on deploy.
  const webAssetVersion = env.VITE_WEB_ASSET_VERSION || '0.1.0';
  return {
    plugins: [integralAppPublicPages(appPublicPaths), react()],
    define: {
      // react-grid-layout/legacy references process.env.NODE_ENV in dev bundles.
      'process.env.NODE_ENV': JSON.stringify(nodeEnv),
      'import.meta.env.VITE_WEB_ASSET_VERSION': JSON.stringify(webAssetVersion),
    },
    resolve: {
      // pnpm may nest react under transitive deps; dedupe so hooks use one copy.
      dedupe: ['react', 'react-dom'],
    },
    build: {
      // Split boot-time vendor libraries out of the main entry chunk. Routes
      // are already lazy-loaded (React.lazy in App.tsx), so this keeps vendor
      // dependencies in stable, separately-cached chunks. Vite 8 uses
      // Rolldown's current `codeSplitting` API; test patterns use `[\\/]` to
      // match module ids on every platform.
      rolldownOptions: {
        output: {
          // Preserve import side-effect order while keeping the manual vendor
          // boundaries below; some UI and agent packages register at import.
          strictExecutionOrder: true,
          codeSplitting: {
            groups: [
              {
                name: 'react-vendor',
                test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/,
              },
              {
                name: 'chat-markdown-vendor',
                test: /node_modules[\\/](@assistant-ui|react-markdown|remark-gfm|remark-breaks|remark-parse|remark-rehype|micromark|decode-named-character-reference|mdast-util-|hast-util-|unist-util-|property-information|space-separated-tokens|comma-separated-tokens|dompurify)[\\/]/,
              },
              {
                name: 'query-vendor',
                test: /node_modules[\\/]@tanstack[\\/]/,
              },
            ],
          },
        },
      },
    },
    server: {
      port: 9006,
      host: '0.0.0.0',
      proxy: {
        // /api/events is the Phase 2 Plan 02-03 events WebSocket. Vite
        // matches proxy rules first-rule-wins, so this MUST come before
        // the catch-all `/api` rule below — otherwise the generic HTTP
        // proxy swallows the request, the WS upgrade never reaches the
        // backend, the socket stalls in CONNECTING, and ActivityPanel
        // sits on "Connecting…" forever. `ws: true` enables the upgrade
        // forwarding the same way the `/ws` rule does for the agent
        // events stream.
        '/api/events': { target: backend, ws: true, changeOrigin: true, secure: false },
        '/api': { target: backend, changeOrigin: true, secure: false },
        // /ws/* needs explicit `ws: true` for WebSocket upgrade
        // forwarding. Without this, connections to ws://localhost:9006/
        // ws/agent-events stall in CONNECTING forever — Vite has no
        // proxy rule, so the upgrade request never reaches the
        // backend on port 4000. Symptom in the app: cards never appear
        // in the inbox because staging_created events can't be pushed.
        '/ws': { target: backend, ws: true, changeOrigin: true, secure: false },
      },
    },
  };
});
