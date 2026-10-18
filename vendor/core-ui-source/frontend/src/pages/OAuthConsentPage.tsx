/**
 * Task M3c-1 — OAuth consent page.
 *
 * Completes the SPA-driven authorize flow for MCP clients. An
 * unauthenticated browser sent to `/api/oauth/authorize` is 302-redirected
 * (by the jvspatial authorization server, M3a) to this SPA route,
 * `/oauth/authorize?<oauth params>`. The route is authed (wrapped in
 * `RequireAuth` in App.tsx), so an unauthenticated visitor is bounced to
 * `/login` with `state.from` preserving the full location (incl. the OAuth
 * query string) and returned here via `safePostAuthRedirect` after login.
 *
 * On mount we parse the OAuth params from the URL and fetch the consent
 * details (M3b-1 backend). The user approves or denies; the backend returns
 * the `redirect_uri?...` URL and we navigate the browser there with
 * `window.location.assign` — a cross-origin nav back to the MCP client, NOT
 * a React-router navigation.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Logo, LogoMark } from '../components/ui';
import { Button } from '../components/ui/Button';
import { Surface, Text, Stack, Inline } from '../ui';
import {
  approve,
  deny,
  getConsent,
  type ConsentDetails,
} from '../api/oauthConsent';

type Phase = 'loading' | 'ready' | 'error';
type Pending = 'approve' | 'deny' | null;

export function OAuthConsentPage() {
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('loading');
  const [consent, setConsent] = useState<ConsentDetails | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  // OAuth params arrive on the query string; forward them verbatim to the
  // backend on every call so it can validate the client + redirect_uri.
  const params = Object.fromEntries(searchParams.entries());

  useEffect(() => {
    let active = true;
    setPhase('loading');
    getConsent(searchParams)
      .then((details) => {
        if (!active) return;
        setConsent(details);
        setPhase('ready');
      })
      .catch(() => {
        if (active) setPhase('error');
      });
    return () => {
      active = false;
    };
    // searchParams identity is stable per navigation; re-run only if it changes.

  }, [searchParams]);

  const decide = useCallback(
    async (which: 'approve' | 'deny') => {
      if (pending) return;
      setPending(which);
      try {
        const res =
          which === 'approve' ? await approve(params) : await deny(params);
        // Cross-origin nav back to the MCP client's redirect_uri — use a
        // full browser navigation, not React-router.
        window.location.assign(res.redirect);
      } catch {
        // Surface the failure inline and let the user retry the decision.
        setPending(null);
        setPhase('error');
      }
    },
    [params, pending],
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Inline gap="sm" align="center" justify="center" className="mb-8">
          <Logo to="/" size="md" />
        </Inline>

        {phase === 'loading' ? (
          <div
            role="status"
            aria-label="Loading consent request"
            className="flex items-center justify-center py-16"
          >
            <span className="animate-pulse">
              <LogoMark size="lg" />
            </span>
          </div>
        ) : phase === 'error' ? (
          <Surface
            tone="panel"
            border="default"
            radius="card"
            elevation="card"
            padding="lg"
            role="alert"
          >
            <Stack gap="sm" align="center">
              <Text variant="heading-sm" tone="danger">
                Something went wrong
              </Text>
              <Text variant="subtitle" tone="muted" className="text-center">
                We couldn&rsquo;t load this authorization request. The link may
                have expired or be invalid. Close this window and try connecting
                again from your client.
              </Text>
            </Stack>
          </Surface>
        ) : consent ? (
          <Surface
            tone="panel"
            border="default"
            radius="card"
            elevation="card"
            padding="lg"
          >
            <Stack gap="lg">
              <Stack gap="xs" align="center">
                <Text variant="heading-md" as="h1" className="text-center">
                  {consent.client_name} wants to access your Integral account
                </Text>
                <Text variant="subtitle" tone="muted" className="text-center">
                  Review the access being requested before you continue.
                </Text>
              </Stack>

              <Stack gap="sm">
                <Text variant="label" tone="subtle">
                  This will allow {consent.client_name} to
                </Text>
                <Surface
                  tone="panel-2"
                  border="subtle"
                  radius="input"
                  padding="md"
                >
                  <Stack gap="xs" as="ul">
                    {consent.scopes.map((scope) => (
                      <Inline key={scope} gap="sm" align="baseline" as="li">
                        <Text variant="body-sm" tone="muted" aria-hidden>
                          &bull;
                        </Text>
                        <Text variant="body-sm">{scope}</Text>
                      </Inline>
                    ))}
                  </Stack>
                </Surface>
              </Stack>

              <Stack gap="sm">
                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  loading={pending === 'approve'}
                  disabled={pending !== null}
                  onClick={() => decide('approve')}
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  className="w-full"
                  loading={pending === 'deny'}
                  disabled={pending !== null}
                  onClick={() => decide('deny')}
                >
                  Deny
                </Button>
              </Stack>

              <Text variant="meta" tone="subtle" className="text-center">
                You can revoke this access at any time from your settings.
              </Text>
            </Stack>
          </Surface>
        ) : null}
      </div>
    </div>
  );
}

export default OAuthConsentPage;
