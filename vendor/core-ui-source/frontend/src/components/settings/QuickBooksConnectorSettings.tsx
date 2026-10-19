/**
 * Phase 18 QB-05 — QuickBooks connector settings panel.
 *
 * Post-authorization configuration: scheduled sync interval, "Sync now"
 * affordance, last-sync stats, and a "Reconnect" surface when the
 * connector's ``auth_state.reauth_required`` is set (the refresh token
 * has expired or been revoked).
 *
 * Token material is NEVER rendered — only realm_id, environment,
 * last_synced_at, sync_interval_seconds.
 */

import { useCallback, useState } from 'react';
import {
  connectorsApi,
  type ConnectorResponse,
  type SyncStats,
} from '../../api/connectors';
import { Text } from '../../ui';

export interface QuickBooksConnectorSettingsProps {
  connector: ConnectorResponse;
  onReconnect?: () => void;
  onUpdated?: (next: ConnectorResponse) => void;
}

const _MIN_INTERVAL_SECONDS = 60;

export function QuickBooksConnectorSettings({
  connector,
  onReconnect,
  onUpdated,
}: QuickBooksConnectorSettingsProps) {
  const initialInterval = Math.max(
    _MIN_INTERVAL_SECONDS,
    connector.sync_interval_seconds || 300,
  );
  const [intervalSeconds, setIntervalSeconds] =
    useState<number>(initialInterval);
  const [syncing, setSyncing] = useState(false);
  const [lastStats, setLastStats] = useState<SyncStats | null>(null);
  const [savingInterval, setSavingInterval] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // realm_id + environment are the only auth_state scalars surfaced.
  // The callback redacts tokens at the schema boundary; we additionally
  // never read access_token/refresh_token from the response shape.
  const realmId =
    typeof connector.auth_state?.realm_id === 'string'
      ? (connector.auth_state.realm_id as string)
      : '';
  const environment =
    typeof connector.auth_state?.environment === 'string'
      ? (connector.auth_state.environment as string)
      : '';
  const reauthRequired = Boolean(connector.auth_state?.reauth_required);

  const saveInterval = useCallback(async () => {
    setSavingInterval(true);
    setErrorMessage('');
    try {
      const next = await connectorsApi.patch(connector.id, {
        sync_interval_seconds: Math.max(_MIN_INTERVAL_SECONDS, intervalSeconds),
      });
      onUpdated?.(next);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Sync interval update failed',
      );
    } finally {
      setSavingInterval(false);
    }
  }, [connector.id, intervalSeconds, onUpdated]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    setErrorMessage('');
    try {
      const stats = await connectorsApi.sync(connector.id);
      setLastStats(stats);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [connector.id]);

  return (
    <div
      data-testid="quickbooks-connector-settings"
      className="rounded-md border border-[var(--panel-border)] p-4"
    >
      <Text variant="heading-sm">QuickBooks connection</Text>
      <div className="mt-2 flex flex-col gap-1">
        <Text variant="meta" tone="muted">
          Realm {realmId || '—'} · Environment {environment || '—'}
        </Text>
        <Text variant="meta" tone="muted">
          Last synced: {connector.last_synced_at || 'never'}
        </Text>
      </div>

      {reauthRequired ? (
        <div className="mt-3" data-testid="quickbooks-reconnect">
          <Text variant="meta" as="p">
            QuickBooks re-authorization required. Refresh token expired or revoked.
          </Text>
          <button
            type="button"
            onClick={() => onReconnect?.()}
            className="mt-2 rounded-md border border-[var(--panel-border)] px-3 py-1.5 hover:opacity-80"
            data-testid="quickbooks-reconnect-button"
          >
            <Text variant="meta">Reconnect QuickBooks</Text>
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <Text variant="meta">Sync interval (seconds)</Text>
          <input
            type="number"
            min={_MIN_INTERVAL_SECONDS}
            value={intervalSeconds}
            onChange={e =>
              setIntervalSeconds(Math.max(_MIN_INTERVAL_SECONDS, Number(e.target.value)))
            }
            className="w-28 rounded-md border border-[var(--panel-border)] px-2 py-1"
            data-testid="quickbooks-interval-input"
          />
        </label>
        <button
          type="button"
          onClick={saveInterval}
          disabled={savingInterval}
          className="rounded-md border border-[var(--panel-border)] px-3 py-1.5 hover:opacity-80"
          data-testid="quickbooks-save-interval"
        >
          <Text variant="meta">{savingInterval ? 'Saving…' : 'Save'}</Text>
        </button>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={syncNow}
          disabled={syncing}
          className="rounded-md border border-[var(--panel-border)] px-3 py-1.5 hover:opacity-80"
          data-testid="quickbooks-sync-now"
        >
          <Text variant="meta">{syncing ? 'Syncing…' : 'Sync now'}</Text>
        </button>
      </div>

      {lastStats ? (
        <div className="mt-3" data-testid="quickbooks-last-stats">
          <Text variant="meta" tone="muted">
            Last sync: created {lastStats.created} · updated {lastStats.updated} ·
            conflict {lastStats.conflict}
          </Text>
        </div>
      ) : null}

      {errorMessage ? (
        <Text variant="meta" as="p" className="mt-2">
          {errorMessage}
        </Text>
      ) : null}
    </div>
  );
}
