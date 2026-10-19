/**
 * Phase 19 EML-01 + EML-05 — Gmail connector setup UI.
 *
 * Multi-step flow:
 * 1. "Connect Google account" → opens consent popup. Test-seam manual
 * callback button completes the OAuth round-trip in tests.
 * 2. Label picker — fetches the connected mailbox's labels and renders
 * a checkbox list. Nothing is checked by default (EML-05).
 * Operator-only-opt-in semantics; the helper copy plainly states
 * that internal/HR/personal labels should be left unchecked.
 * 3. Consent panel — the connector cannot activate until the operator
 * acknowledges the consent text + at least one label is checked.
 * 4. Submit — POST to /gmail/labels persists the selection and the
 * consent acknowledgement on Connector.auth_state.
 *
 * Tokens are NEVER rendered. The only visible status comes from the
 * redacted callback response (connector_id, connected, reauth).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  connectorsApi,
  type GmailLabel,
} from '../../../api/connectors';
import { Text } from '../../../ui';

export interface GmailConnectorSetupProps {
  initialConnectorId?: string;
  onActivated?: (info: { connectorId: string; labels: string[] }) => void;
}

type Step = 'connect' | 'pick-labels' | 'done' | 'error';

export function GmailConnectorSetup({
  initialConnectorId,
  onActivated,
}: GmailConnectorSetupProps) {
  const [step, setStep] = useState<Step>(initialConnectorId ? 'pick-labels' : 'connect');
  const [connectorId, setConnectorId] = useState<string | undefined>(
    initialConnectorId,
  );
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!initialConnectorId) return;
    let cancelled = false;
    (async () => {
      try {
        const lbls = await connectorsApi.gmailLabels(initialConnectorId);
        if (!cancelled) setLabels(lbls.labels);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load labels');
          setStep('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialConnectorId]);

  const launchOAuth = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const { consent_url } = await connectorsApi.gmailOauthStart({
        connector_id: connectorId,
      });
      window.open(
        consent_url,
        'gmail-oauth',
        'width=600,height=720,scrollbars=yes',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth start failed');
      setStep('error');
    } finally {
      setBusy(false);
    }
  }, [connectorId]);

  const completeCallback = useCallback(
    async (code: string, state: string) => {
      setBusy(true);
      setError('');
      try {
        const cb = await connectorsApi.gmailOauthCallback({
          code,
          state,
          connector_id: connectorId,
        });
        setConnectorId(cb.connector_id);
        const lbls = await connectorsApi.gmailLabels(cb.connector_id);
        setLabels(lbls.labels);
        setStep('pick-labels');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'OAuth callback failed');
        setStep('error');
      } finally {
        setBusy(false);
      }
    },
    [connectorId],
  );

  const toggleLabel = useCallback((labelId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      return next;
    });
  }, []);

  const activate = useCallback(async () => {
    if (!connectorId) return;
    if (!consent || selected.size === 0) return;
    setBusy(true);
    setError('');
    try {
      const labelIds = Array.from(selected);
      await connectorsApi.gmailSetLabels(connectorId, {
        label_ids: labelIds,
        consent_acknowledged: true,
      });
      setStep('done');
      onActivated?.({ connectorId, labels: labelIds });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setStep('error');
    } finally {
      setBusy(false);
    }
  }, [connectorId, consent, selected, onActivated]);

  return (
    <div
      data-testid="gmail-connector-setup"
      className="rounded-md border border-[var(--panel-border)] p-4"
    >
      <Text variant="heading-sm">Connect Gmail</Text>
      <Text variant="meta" as="p" className="mt-1">
        Mirror selected Gmail labels into Communications. Read-only —
        Integral never sends or modifies mail.
      </Text>

      {step === 'connect' ? (
        <>
          <button
            type="button"
            onClick={launchOAuth}
            disabled={busy}
            className="mt-3 rounded-md border border-[var(--panel-border)] px-3 py-1.5 hover:opacity-80"
            data-testid="gmail-connect-google-account"
          >
            <Text variant="meta">
              {busy ? 'Opening Google…' : 'Connect Google account'}
            </Text>
          </button>
          {/* Test seam — sr-only button that completes the OAuth callback
              with mock code/state so the smoke test exercises the
              label-fetch + consent path without a real popup. */}
          <button
            type="button"
            onClick={() => completeCallback('mock-code', 'mock-state')}
            className="sr-only"
            aria-hidden
            data-testid="gmail-manual-callback"
          >
            manual callback (test only)
          </button>
        </>
      ) : null}

      {step === 'pick-labels' && connectorId ? (
        <div className="mt-3" data-testid="gmail-label-picker">
          <Text variant="meta" as="p">
            Choose Gmail labels to mirror. Personal / HR / internal labels
            should be left unchecked — their mail will never enter Integral.
          </Text>
          <ul className="mt-2 flex flex-col gap-1">
            {labels.map(l => (
              <li key={l.id}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(l.id)}
                    onChange={() => toggleLabel(l.id)}
                    data-testid={`gmail-label-${l.id}`}
                  />
                  <Text variant="meta">
                    {l.name} ({l.type})
                  </Text>
                </label>
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-start gap-2">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.currentTarget.checked)}
              data-testid="gmail-consent-checkbox"
            />
            <Text variant="meta">
              I confirm the selected labels carry no personal, HR, or
              privileged mail; their bodies will become substrate entries
              visible to anyone with access to the Communications track.
            </Text>
          </label>
          <button
            type="button"
            onClick={activate}
            disabled={busy || !consent || selected.size === 0}
            className="mt-3 rounded-md border border-[var(--panel-border)] px-3 py-1.5 hover:opacity-80 disabled:opacity-50"
            data-testid="gmail-activate"
          >
            <Text variant="meta">{busy ? 'Saving…' : 'Activate connector'}</Text>
          </button>
        </div>
      ) : null}

      {step === 'done' ? (
        <Text variant="meta" tone="muted" as="p" className="mt-3" >
          Gmail connector activated.
        </Text>
      ) : null}

      {error ? (
        <Text variant="meta" as="p" className="mt-2">
          {error}
        </Text>
      ) : null}
    </div>
  );
}
