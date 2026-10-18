/**
 * Popup landing for Intuit QuickBooks OAuth (native sync and QuickBooks MCP).
 * Intuit redirects here with ``?code&state&realmId``. We POST to the authed
 * backend, then ``postMessage`` the opener (same channel as MCP OAuth so
 * the catalog install sheet can close).
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { agentiveErrorMessage } from '../api/helpers';
import {
  MCP_OAUTH_MESSAGE_TYPE,
  connectorsApi,
  type QuickBooksCallbackResponse,
} from '../api/connectors';
import { Logo, LogoMark } from '../components/ui';
import { Surface, Text, Stack } from '../ui';

type Phase = 'working' | 'done' | 'error';

const inflightExchanges = new Map<string, Promise<QuickBooksCallbackResponse>>();

export function resetQuickBooksOAuthExchangesForTests() {
  inflightExchanges.clear();
}

function exchangeOnce(
  code: string,
  state: string,
  realmId: string,
): Promise<QuickBooksCallbackResponse> {
  const key = `${code}:${state}:${realmId}`;
  const existing = inflightExchanges.get(key);
  if (existing) return existing;
  const request = connectorsApi
    .quickbooksCallback({ code, state, realmId })
    .catch(err => {
      inflightExchanges.delete(key);
      throw err;
    });
  inflightExchanges.set(key, request);
  return request;
}

function notifyOpener(payload: { ok: boolean; error?: string }) {
  const message = { type: MCP_OAUTH_MESSAGE_TYPE, ...payload };
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(message, window.location.origin);
  }
}

function closePopup() {
  window.close();
  window.setTimeout(() => {
    window.close();
  }, 250);
}

export function QuickBooksOAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('working');
  const [error, setError] = useState('');

  useEffect(() => {
    const oauthError = searchParams.get('error');
    const description = searchParams.get('error_description');
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const realmId = searchParams.get('realmId');

    if (oauthError) {
      const message = description || oauthError;
      setError(message);
      setPhase('error');
      notifyOpener({ ok: false, error: message });
      closePopup();
      return;
    }
    if (!code || !state || !realmId) {
      const message = 'Missing authorization code, state, or company id';
      setError(message);
      setPhase('error');
      notifyOpener({ ok: false, error: message });
      return;
    }

    let cancelled = false;
    exchangeOnce(code, state, realmId)
      .then(() => {
        if (cancelled) return;
        setPhase('done');
        notifyOpener({ ok: true });
        closePopup();
      })
      .catch(err => {
        if (cancelled) return;
        const message = agentiveErrorMessage(err, 'OAuth callback failed');
        setError(message);
        setPhase('error');
        notifyOpener({ ok: false, error: message });
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo to="/" size="md" />
        </div>
        {phase === 'working' ? (
          <div
            role="status"
            aria-label="Finishing QuickBooks authorization"
            className="flex items-center justify-center py-16"
            data-testid="qb-oauth-callback-working"
          >
            <span className="animate-pulse">
              <LogoMark size="lg" />
            </span>
          </div>
        ) : (
          <Surface
            tone="panel"
            border="default"
            radius="card"
            elevation="card"
            padding="lg"
            role={phase === 'error' ? 'alert' : 'status'}
            data-testid={
              phase === 'error' ? 'qb-oauth-callback-error' : 'qb-oauth-callback-done'
            }
          >
            <Stack gap="sm" align="center">
              <Text variant="heading-sm" tone={phase === 'error' ? 'danger' : undefined}>
                {phase === 'error'
                  ? 'Authorization failed'
                  : 'Connected — you can close this window'}
              </Text>
              {error ? (
                <Text variant="body-sm" tone="muted" className="text-center">
                  {error}
                </Text>
              ) : (
                <Text variant="body-sm" tone="muted" className="text-center">
                  Return to the settings tab to finish setup.
                </Text>
              )}
            </Stack>
          </Surface>
        )}
      </div>
    </div>
  );
}
