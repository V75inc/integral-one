import { useHostSessionNotification } from './components/system/useHostSessionNotification';
import { useDeployment } from './hooks/useDeployment';
import { AppCatalogRedirect } from './components/apps/AppCatalogRedirect';
import { HostAccessPage } from './host/access';
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AgentiveProvider } from './context/AgentiveContext';
import { Layout } from './components/layout';
import { LogoMark } from './components/ui';
import {
  AppErrorBoundary,
  SystemNotificationBar,
  SystemNotificationsProvider,
  useBuildVersionWatch,
  useOfflineNotification,
} from './components/system';
import { RequirePlatformAdmin } from './components/admin/RequirePlatformAdmin';
import { AdminLayout } from './components/admin/AdminLayout';
import { getRegisteredAdminRoutes } from './host/registry';

const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const SignupPage = lazy(() =>
  import('./pages/SignupPage').then((m) => ({ default: m.SignupPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPasswordPage').then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const CredentialsDeliveryPage = lazy(() =>
  import('./pages/CredentialsDeliveryPage').then((m) => ({ default: m.CredentialsDeliveryPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./pages/ResetPasswordPage').then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const VerifyEmailPage = lazy(() =>
  import('./pages/VerifyEmailPage').then((m) => ({
    default: m.VerifyEmailPage,
  })),
);
const FeedPage = lazy(() =>
  import('./pages/FeedPage').then((m) => ({ default: m.FeedPage })),
);
const MissionControlPage = lazy(() =>
  import('./pages/MissionControlPage').then((m) => ({
    default: m.MissionControlPage,
  })),
);
const TracksPage = lazy(() =>
  import('./pages/TracksPage').then((m) => ({ default: m.TracksPage })),
);
const TrackDetailPage = lazy(() =>
  import('./pages/TrackDetailPage').then((m) => ({
    default: m.TrackDetailPage,
  })),
);
const EntryPage = lazy(() =>
  import('./pages/EntryPage').then((m) => ({ default: m.EntryPage })),
);
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({
    default: m.NotificationsPage,
  })),
);
const WorkspacesPage = lazy(() =>
  import('./pages/WorkspacesPage').then((m) => ({
    default: m.WorkspacesPage,
  })),
);
const WorkspaceDetailPage = lazy(() =>
  import('./pages/WorkspaceDetailPage').then((m) => ({
    default: m.WorkspaceDetailPage,
  })),
);
const WorkspaceMembersPage = lazy(() =>
  import('./pages/WorkspaceMembersPage').then((m) => ({
    default: m.WorkspaceMembersPage,
  })),
);
const WorkspaceSetupPage = lazy(() =>
  import('./pages/WorkspaceSetupPage').then((m) => ({
    default: m.WorkspaceSetupPage,
  })),
);
const InvitationAcceptPage = lazy(() =>
  import('./pages/InvitationAcceptPage').then((m) => ({
    default: m.InvitationAcceptPage,
  })),
);
const InvitationReceivedPage = lazy(() =>
  import('./pages/InvitationReceivedPage').then((m) => ({
    default: m.InvitationReceivedPage,
  })),
);
// Phase 21 PF-03 — unauthenticated portfolio share surface.
const SharedPortfolioPage = lazy(() =>
  import('./pages/SharedPortfolioPage').then((m) => ({
    default: m.SharedPortfolioPage,
  })),
);
const SharedTrackPage = lazy(() =>
  import('./pages/SharedTrackPage').then((m) => ({
    default: m.SharedTrackPage,
  })),
);
const MemberAssignedFormPage = lazy(() =>
  import('./features/memberAssignedForm/MemberAssignedFormPage').then((m) => ({
    default: m.MemberAssignedFormPage,
  })),
);
const AppsPage = lazy(() =>
  import('./pages/AppsPage').then((m) => ({ default: m.AppsPage })),
);
const AppDetailPage = lazy(() =>
  import('./pages/AppDetailPage').then((m) => ({
    default: m.AppDetailPage,
  })),
);
const AIChatPage = lazy(() =>
  import('./pages/AIChatPage').then((m) => ({ default: m.AIChatPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const DocumentTemplateListPage = lazy(() =>
  import('./features/documents').then(m => ({
    default: m.DocumentTemplateListPage,
  })),
);
const DocumentTemplateEditorPage = lazy(() =>
  import('./features/documents').then(m => ({
    default: m.DocumentTemplateEditorPage,
  })),
);
const TemplateVersionHistoryPage = lazy(() =>
  import('./features/documents').then(m => ({
    default: m.TemplateVersionHistoryPage,
  })),
);
const AdminOverviewPage = lazy(() =>
  import('./pages/admin/AdminOverviewPage').then((m) => ({
    default: m.AdminOverviewPage,
  })),
);
const AdminUsersPage = lazy(() =>
  import('./pages/admin/AdminUsersPage').then((m) => ({
    default: m.AdminUsersPage,
  })),
);
const AdminUserDetailPage = lazy(() =>
  import('./pages/admin/AdminUserDetailPage').then((m) => ({
    default: m.AdminUserDetailPage,
  })),
);
const AdminWorkspacesPage = lazy(() =>
  import('./pages/admin/AdminWorkspacesPage').then((m) => ({
    default: m.AdminWorkspacesPage,
  })),
);
const AdminWorkspaceDetailPage = lazy(() =>
  import('./pages/admin/AdminWorkspaceDetailPage').then((m) => ({
    default: m.AdminWorkspaceDetailPage,
  })),
);
const AdminAppsPage = lazy(() =>
  import('./pages/admin/AdminAppsPage').then((m) => ({
    default: m.AdminAppsPage,
  })),
);
const AdminTracksPage = lazy(() =>
  import('./pages/admin/AdminAppsPage').then((m) => ({
    default: m.AdminTracksPage,
  })),
);
const AdminAppDetailPage = lazy(() =>
  import('./pages/admin/AdminAppsPage').then((m) => ({
    default: m.AdminAppDetailPage,
  })),
);
const AdminTrackDetailPage = lazy(() =>
  import('./pages/admin/AdminAppsPage').then((m) => ({
    default: m.AdminTrackDetailPage,
  })),
);
// Phase 7 Plan 07-04 — approval review surface (UX-03). Lazy-loaded per
// the existing per-page idiom so the chunk only ships when an operator
// visits /approvals.
const ApprovalsPage = lazy(() =>
  import('./components/approvals/ApprovalsPage').then((m) => ({
    default: m.ApprovalsPage,
  })),
);
const BackgroundTasksPage = lazy(() =>
  import('./components/routines/BackgroundTasksPage').then((m) => ({
    default: m.BackgroundTasksPage,
  })),
);
// Task M3c-1 — OAuth consent surface. The AS (jvspatial M3a) 302-redirects
// an unauthenticated authorize request here; the page is authed (RequireAuth)
// but renders WITHOUT the in-app Layout chrome — a bare consent screen reads
// cleaner for a third-party authorization handoff.
const OAuthConsentPage = lazy(() =>
  import('./pages/OAuthConsentPage').then((m) => ({
    default: m.OAuthConsentPage,
  })),
);
const McpOAuthCallbackPage = lazy(() =>
  import('./pages/McpOAuthCallbackPage').then((m) => ({
    default: m.McpOAuthCallbackPage,
  })),
);
const QuickBooksOAuthCallbackPage = lazy(() =>
  import('./pages/QuickBooksOAuthCallbackPage').then((m) => ({
    default: m.QuickBooksOAuthCallbackPage,
  })),
);

function FullScreenLoading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="min-h-screen flex items-center justify-center bg-[var(--bg)]"
    >
      {/* System logo mark — breathing animation reads as a quiet
          loading state without the heavy spinner-in-a-tile chrome.
          The mark scales with the user's theme automatically. */}
      <span className="animate-pulse">
        <LogoMark size="lg" />
      </span>
    </div>
  );
}

function PageFallback() {
  return <FullScreenLoading />;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoading />;
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

/** Mount inside the provider so the hook can call notify/dismiss. */
function SystemConnectivityWatchers() {
  useOfflineNotification();
  useHostSessionNotification();
  useBuildVersionWatch();
  return null;
}

export default function App() {
  // Pathname doubles as the error boundary's reset key: navigating away from a
  // route that threw clears the panel instead of leaving it pinned across the
  // whole app. Found in smoke testing — see AppErrorBoundary.componentDidUpdate.
  const { pathname } = useLocation();
  const { singleUser } = useDeployment();
  return (
    <AgentiveProvider>
    <SystemNotificationsProvider>
    <SystemConnectivityWatchers />
    <SystemNotificationBar />
    {/* Single global squeeze wrapper — pushes every route (public auth
        pages AND in-app Layout) down when the system bar mounts, so
        the squeeze animation is consistent app-wide. */}
    <div
      className="system-bar-layout"
      style={{ paddingTop: 'var(--system-bar-h, 0px)' }}
    >
    {/* Inside Suspense so a failed lazy() chunk lands here rather than
        unmounting the app, and inside the provider so the boundary can
        report through the system bar. Nested under the bar + squeeze
        wrapper so the chrome survives a route-level crash. */}
    <AppErrorBoundary scope="routes" resetKey={pathname}>
    <Suspense fallback={<PageFallback />}>
    <Routes>
      <Route path="/login" element={singleUser ? <HostAccessPage /> : <LoginPage />} />
      <Route path="/signup" element={singleUser ? <HostAccessPage /> : <SignupPage />} />
      <Route path="/forgot-password" element={singleUser ? <HostAccessPage /> : <ForgotPasswordPage />} />
      <Route path="/credentials-delivery-verify" element={<CredentialsDeliveryPage />} />
      <Route path="/credentials-delivery-verify.html" element={<CredentialsDeliveryPage />} />
      <Route path="/reset-password" element={singleUser ? <HostAccessPage /> : <ResetPasswordPage />} />
      <Route path="/verify-email" element={singleUser ? <HostAccessPage /> : <VerifyEmailPage />} />
      <Route
        path="/invitations/received/:invitationId"
        element={
          <RequireAuth>
            <InvitationReceivedPage />
          </RequireAuth>
        }
      />
      <Route path="/invitations/:token" element={<InvitationAcceptPage />} />
      <Route
        path="/portfolio/shared/:token"
        element={<SharedPortfolioPage />}
      />
      <Route
        path="/public/tracks/:token"
        element={<SharedTrackPage />}
      />
      {/* Task M3c-1 — OAuth consent. Authed (so an unauthenticated MCP
          client browser is bounced to /login with state.from and returned
          here, query string intact, via safePostAuthRedirect) but OUTSIDE
          the Layout group — a bare consent screen for the third-party
          authorization handoff. */}
      <Route
        path="/oauth/authorize"
        element={
          <RequireAuth>
            <OAuthConsentPage />
          </RequireAuth>
        }
      />
      <Route
        path="/settings/connectors/mcp/oauth/callback"
        element={
          <RequireAuth>
            <McpOAuthCallbackPage />
          </RequireAuth>
        }
      />
      <Route
        path="/connectors/quickbooks/callback"
        element={
          <RequireAuth>
            <QuickBooksOAuthCallbackPage />
          </RequireAuth>
        }
      />
      <Route path="/" element={
        <RequireAuth><Layout /></RequireAuth>
      }>
        <Route
          path="admin"
          element={
            <RequirePlatformAdmin>
              <AdminLayout />
            </RequirePlatformAdmin>
          }
        >
          <Route index element={<AdminOverviewPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="users/:userId" element={<AdminUserDetailPage />} />
          <Route path="workspaces" element={<AdminWorkspacesPage />} />
          <Route path="workspaces/:workspaceId" element={<AdminWorkspaceDetailPage />} />
          <Route path="apps" element={<AdminAppsPage />} />
          <Route path="apps/:appId" element={<AdminAppDetailPage />} />
          <Route path="tracks" element={<AdminTracksPage />} />
          <Route path="tracks/:trackId" element={<AdminTrackDetailPage />} />
          {getRegisteredAdminRoutes().map(route => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
        </Route>
        <Route index element={<MissionControlPage />} />
        <Route path="feed" element={<FeedPage />} />
        <Route path="me/assigned-form" element={<MemberAssignedFormPage />} />
        <Route
          path="hr/employee-onboarding"
          element={<Navigate to="/me/assigned-form" replace />}
        />
        <Route path="mission-control" element={<Navigate to="/" replace />} />
        {/* B-SHARE-03: /shared retired. Auto-grant of guest membership
            on first cross-workspace share lifts the resource into the
            workspace nav, so the surface never populated. Redirect any
            bookmarked links to Mission Control instead of 404. */}
        <Route path="shared" element={<Navigate to="/" replace />} />
        <Route path="tracks" element={<TracksPage />} />
        <Route path="tracks/:id" element={<TrackDetailPage />} />
        <Route path="entries/:entryId" element={<EntryPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<Navigate to="/settings#profile" replace />} />
        <Route path="workspaces" element={<WorkspacesPage />} />
        <Route path="workspaces/setup" element={<WorkspaceSetupPage />} />
        <Route path="workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
        <Route
          path="workspaces/:workspaceId/members"
          element={<WorkspaceMembersPage />}
        />
        <Route
          path="workspaces/:workspaceId/document-templates"
          element={<DocumentTemplateListPage />}
        />
        <Route
          path="workspaces/:workspaceId/document-templates/:templateId/edit"
          element={<DocumentTemplateEditorPage />}
        />
        <Route
          path="workspaces/:workspaceId/document-templates/:templateId/versions"
          element={<TemplateVersionHistoryPage />}
        />
        <Route path="apps" element={<AppsPage />} />
        <Route path="apps/:appId" element={<AppDetailPage />} />
        <Route path="models" element={<AppCatalogRedirect />} />
        <Route path="models/:id" element={<AppCatalogRedirect />} />
        {/* Legacy UI route retained for existing bookmarks; APIs retain their
            operational-model namespace until a versioned migration. */}
        <Route path="operational-models" element={<AppCatalogRedirect />} />
        <Route path="operational-models/:id" element={<AppCatalogRedirect />} />
        <Route path="chat" element={<Navigate to="/agent" replace />} />
        <Route path="agent" element={<AIChatPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {/* Phase 7 Plan 07-04 (UX-03) — agent action approval queue. */}
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="background-tasks" element={<BackgroundTasksPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </AppErrorBoundary>
    </div>
    </SystemNotificationsProvider>
    </AgentiveProvider>
  );
}
