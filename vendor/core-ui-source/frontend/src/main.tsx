import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { CrumbsProvider } from './context/CrumbsContext';
import { ScopeProvider } from './context/ScopeContext';
import App from './App';
import { AuthBootstrappedPlugins } from './components/system/AuthBootstrappedPlugins';
import { initTelemetry } from './lib/telemetry';
import { clearStaleBuildReloadFlag } from './lib/buildVersion';
import './index.css';
// Registers built-in + plugin view widgets (editable_table, action_bar, …)
// via a synchronous, network-free import.meta.glob side effect. Previously
// this only ran because TrackDetailPage/SharedTrackPage happened to import
// `views/index.ts` — any route that renders a view widget without going
// through those pages first (e.g. direct nav to /entries/:id) hit "Widget
// not available". Importing here guarantees registration at boot for every
// route, public or authed.
import './views';
// Commercial UI slots (empty stub in OSS; Business overlays register.tsx).
import './host/register';

initTelemetry();
// Successful boot of a working bundle — allow a future deploy's stale-chunk
// path to auto-reload once again in this tab.
clearStaleBuildReloadFlag();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* On react-router v7 the `future` prop is gone: v7_startTransition and
          v7_relativeSplatPath are the default behaviour now, not opt-ins.
          B-AUTH-05 had already enabled both under v6, so this app has been
          running v7 routing semantics for a while — the upgrade changes the
          package version, not how routes resolve. */}
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <AuthBootstrappedPlugins />
            <ToastProvider>
              <ConfirmProvider>
                <CrumbsProvider>
                  <ScopeProvider>
                    <App />
                  </ScopeProvider>
                </CrumbsProvider>
              </ConfirmProvider>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
