import { PageMeta } from '../../../components/ui';
/**
 * Phase 9 Plan 09-04 — Settings → Notifications section (NOTIF-03).
 *
 * Renders the 6-kind × 3-channel toggle matrix. Each cell PATCHes
 * /api/users/me/notification-preferences with a deep partial that
 * scopes the change to the single (kind, channel) cell — preserving
 * every other cell's state.
 *
 * WhatsApp column gating (A3):
 *   • whatsapp.opted_in_at === null →
 *       — every WhatsApp cell is `disabled` with `opacity-50`,
 *       — column header renders a "verify phone" pointer link
 *         (the OTP flow is directly below the notification matrix).
 *   • whatsapp.opted_in_at set →
 *       — cells are interactive,
 *       — header shows a "verified" pill with the opt-in timestamp.
 *
 * Accessibility: every checkbox carries
 * `aria-label="${kind} via ${channel}"` so the testing-library role
 * queries and axe-core scan both succeed. Plan 09-04 truths block
 * asserts this contract.
 *
 * The kinds rendered in the matrix are the six user-facing ones —
 * `whatsapp_welcome` is system-driven (fires once at opt-in) and is
 * intentionally NOT shown as a user toggle.
 */
import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { WhatsAppSettings } from '../../../components/settings/WhatsAppSettings';

import {
  NOTIFICATION_PREFS_KEY,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type ChannelName,
  type NotificationKind,
  type NotificationPreferences,
} from '../../../api/notificationPreferences';
import { SettingsSection } from '../components/Field';
import { Text } from '../../../ui';
import { Skeleton } from '../../../components/ui/Skeleton';

interface KindRow {
  id: NotificationKind;
  label: string;
  hint: string;
}

const KINDS: KindRow[] = [
  {
    id: 'entry_update',
    label: 'Entry updates',
    hint: 'An entry you follow is changed.',
  },
  {
    id: 'mention',
    label: 'Mentions',
    hint: 'Someone @-mentions you in a comment or entry body.',
  },
  {
    id: 'share',
    label: 'Shares',
    hint: 'An App, Track, or Entry is shared with you.',
  },
  {
    id: 'agent_pending_write',
    label: 'Agent pending writes',
    hint: 'An agent action requires your approval before it lands.',
  },
  {
    id: 'invitation',
    label: 'Invitations',
    hint: 'A workspace or resource invitation needs your acceptance.',
  },
  {
    id: 'system',
    label: 'System',
    hint: 'Maintenance and status updates from Integral.',
  },
];

const CHANNELS: ChannelName[] = ['in_app', 'email', 'whatsapp'];

function channelHeaderLabel(channel: ChannelName): string {
  if (channel === 'in_app') return 'In-app';
  if (channel === 'email') return 'Email';
  return 'WhatsApp';
}

function cellChecked(
  prefs: NotificationPreferences,
  kind: NotificationKind,
  channel: ChannelName,
): boolean {
  const matrix = prefs.kinds[kind] ?? prefs.channels;
  return Boolean(matrix?.[channel]);
}

export function NotificationsSection() {
  const qc = useQueryClient();
  const { data: prefs, isLoading, isError, error, refetch } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const waOptedIn = useMemo(
    () => Boolean(prefs?.whatsapp?.opted_in_at),
    [prefs?.whatsapp?.opted_in_at],
  );

  function setCell(
    kind: NotificationKind,
    channel: ChannelName,
    value: boolean,
  ) {
    if (!prefs) return;
    update.mutate({
      kinds: {
        [kind]: { [channel]: value },
      },
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Text variant="heading-md" weight="semibold" as="h2">Notifications</Text>
        <PageMeta as="p">
          Choose which channels deliver each notification kind. WhatsApp
          requires a verified phone number. Manage your number below.
        </PageMeta>
      </div>

      <SettingsSection
        title="Channels"
        description="Pick which channels deliver each kind of notification."
      >
        {isError ? (
          <div role="alert"><Text variant="body-sm" tone="danger" as="p">
            Failed to load preferences:{' '}
            {(error as Error | undefined)?.message ?? 'unknown error'}
          </Text><button type="button" onClick={() => void refetch()} className="mt-2 underline">Try again</button></div>
        ) : isLoading || !prefs ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th
                    scope="col"
                    className="py-2 pr-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]"
                  >
                    Kind
                  </th>
                  {CHANNELS.map(channel => (
                    <th
                      key={channel}
                      scope="col"
                      className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]"
                    >
                      {channel === 'whatsapp' ? (
                        waOptedIn ? (
                          <span className="inline-flex items-center gap-1">
                            WhatsApp
                            <span className="rounded-[var(--radius-pill)] bg-[var(--success-bg)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--success-fg)]">
                              verified
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex flex-col items-center gap-0.5">
                            <span>WhatsApp</span>
                            <a
                              href="#notifications"
                              onClick={e => { e.preventDefault(); const target = document.getElementById('whatsapp-settings'); target?.scrollIntoView({ behavior: 'auto', block: 'start' }); target?.querySelector<HTMLButtonElement>('button')?.focus(); }}
                              className="text-[10px] font-normal normal-case text-[var(--brand-accent)] underline"
                            >
                              verify phone
                            </a>
                          </span>
                        )
                      ) : (
                        channelHeaderLabel(channel)
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {KINDS.map(({ id, label, hint }) => (
                  <tr
                    key={id}
                    className="border-b border-[var(--border-subtle)] last:border-b-0"
                  >
                    <td className="py-3 pr-3 align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-[var(--text)]">
                          {label}
                        </span>
                        <span className="text-xs text-[var(--text-subtle)]">
                          {hint}
                        </span>
                      </div>
                    </td>
                    {CHANNELS.map(channel => {
                      const disabled =
                        update.isPending || (channel === 'whatsapp' && !waOptedIn);
                      const checked = cellChecked(prefs, id, channel);
                      return (
                        <td
                          key={channel}
                          className={`px-2 py-3 text-center align-middle ${
                            disabled ? 'opacity-50' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            aria-label={`${id} via ${channel}`}
                            onChange={e => setCell(id, channel, e.target.checked)}
                            className="h-4 w-4 cursor-pointer accent-[var(--brand-accent)] disabled:cursor-not-allowed"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {update.isError && <div role="alert"><Text as="p" variant="body-sm" tone="danger">Could not save this preference. Please try again.</Text></div>}
      </SettingsSection>
      <div id="whatsapp-settings" className="scroll-mt-20"><WhatsAppSettings onChange={() => void qc.invalidateQueries({ queryKey: NOTIFICATION_PREFS_KEY })} /></div>
    </div>
  );
}
