import { useMemo } from 'react';
import { CheckCircle2, ExternalLink, FileText } from 'lucide-react';

import type { PublicOnboardingPolicy } from '../../api/sharing';
import { publicSharingApi } from '../../api/sharing';
import { memberAssignedFormApi } from '../../features/memberAssignedForm/memberAssignedFormApi';
import { Surface, Text } from '../../ui';
import { LINE_ICON_STROKE } from '../../components/ui/IconWell';

export type PolicyAcknowledgmentsMap = Record<string, string>;

export function normalizePolicyAcknowledgments(
  raw: unknown,
): PolicyAcknowledgmentsMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PolicyAcknowledgmentsMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(key || '').trim();
    const ts = String(value || '').trim();
    if (id && ts) out[id] = ts;
  }
  return out;
}

export function firstMissingRequiredPolicy(
  policies: PublicOnboardingPolicy[],
  acknowledgments: unknown,
): PublicOnboardingPolicy | null {
  const acks = normalizePolicyAcknowledgments(acknowledgments);
  for (const policy of policies) {
    if (policy.required_for_onboarding === false) continue;
    const id = String(policy.id || '').trim();
    if (!id) continue;
    if (!acks[id]) return policy;
  }
  return null;
}

export function allRequiredPoliciesAcknowledged(
  policies: PublicOnboardingPolicy[],
  acknowledgments: unknown,
): boolean {
  return firstMissingRequiredPolicy(policies, acknowledgments) == null;
}

interface PolicyAcknowledgmentStepProps {
  token: string;
  memberFormMode?: boolean;
  policies: PublicOnboardingPolicy[];
  value: unknown;
  onChange: (next: PolicyAcknowledgmentsMap) => void;
  loading?: boolean;
}

export function PolicyAcknowledgmentStep({
  token,
  memberFormMode = false,
  policies,
  value,
  onChange,
  loading = false,
}: PolicyAcknowledgmentStepProps) {
  const acks = useMemo(() => normalizePolicyAcknowledgments(value), [value]);

  const toggle = (policyId: string, checked: boolean) => {
    const next = { ...acks };
    if (checked) {
      next[policyId] = new Date().toISOString();
    } else {
      delete next[policyId];
    }
    onChange(next);
  };

  if (loading) {
    return (
      <Text variant="body" tone="muted">
        Loading documents…
      </Text>
    );
  }

  if (!policies.length) {
    return (
      <Text variant="body" tone="muted">
        No documents require acknowledgment at this time. Continue to submit.
      </Text>
    );
  }

  return (
    <div className="space-y-3">
      <Text variant="body" tone="muted">
        Please review each document below and confirm you have read and understand it.
        Required documents must be acknowledged before you can submit.
      </Text>
      <ul className="space-y-3">
        {policies.map((policy) => {
          const id = String(policy.id);
          const acknowledged = Boolean(acks[id]);
          const required = policy.required_for_onboarding !== false;
          const viewUrl = memberFormMode
            ? memberAssignedFormApi.getPolicyDocumentUrl(id)
            : publicSharingApi.getOnboardingPolicyDocumentUrl(token, id);
          return (
            <Surface
              as="li"
              key={id}
              tone="panel-2"
              border="default"
              radius="card"
              padding="md"
              backgroundOpacity={30}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Text as="span" variant="meta" tone="muted">
                      <FileText
                      size={16}
                      strokeWidth={LINE_ICON_STROKE}
                      />
                    </Text>
                    <Text as="p" variant="body" weight="semibold" className="truncate">
                      {policy.title || 'Document'}
                      {required ? (
                        <span className="ml-1 text-red-500" aria-hidden>
                          *
                        </span>
                      ) : null}
                    </Text>
                    {acknowledged ? (
                      <CheckCircle2
                        size={16}
                        strokeWidth={LINE_ICON_STROKE}
                        className="shrink-0 text-[var(--success-fg,var(--accent))]"
                        aria-label="Acknowledged"
                      />
                    ) : null}
                  </div>
                  {policy.description ? (
                    <Text as="p" variant="body-sm" tone="muted">
                      {policy.description}
                    </Text>
                  ) : null}
                  {policy.document_filename ? (
                    <Text as="p" variant="meta" tone="subtle">
                      {policy.document_filename}
                    </Text>
                  ) : null}
                </div>
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--panel-border)] px-2.5 py-1"
                >
                  <Text as="span" variant="body-sm" weight="medium">View</Text>
                  <ExternalLink size={12} strokeWidth={LINE_ICON_STROKE} />
                </a>
              </div>
              <Text as="label" variant="body" className="mt-3 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={acknowledged}
                  onChange={(e) => toggle(id, e.target.checked)}
                />
                <Text as="span" variant="body">
                  I have read and understand this document
                  {required ? ' (required)' : ''}
                </Text>
              </Text>
            </Surface>
          );
        })}
      </ul>
    </div>
  );
}
