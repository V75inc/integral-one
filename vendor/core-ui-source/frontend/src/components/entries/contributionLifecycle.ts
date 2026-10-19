/**
 * Lifecycle bridge for native (Core React) entry ui_contributions.
 *
 * Extension iframes speak ``integral.extension.v1`` validate/submit via
 * postMessage. Native regions register the same imperative surface on this
 * context so ``EntryContributionSlot`` can expose one handle to compose.
 */

import { createContext, useContext } from 'react';

export type ContributionValidateResult = {
  ok: boolean;
  error?: string;
  field_errors?: Record<string, string>;
};

export type ContributionSubmitResult = {
  ok: boolean;
  error?: string;
  value?: unknown;
  outcomeRecorded?: boolean;
};

export type ContributionLifecycleHandle = {
  requestValidate: () => Promise<ContributionValidateResult>;
  requestSubmit: (entryId?: string | null) => Promise<ContributionSubmitResult>;
};

export type ContributionLifecycleApi = {
  mode: 'create' | 'edit' | 'detail';
  placement: 'entry_compose' | 'entry_detail';
  entryId?: string;
  trackId?: string;
  entryTypeKey?: string;
  appId?: string;
  customFields: Record<string, unknown>;
  onDraftPatch?: (patch: {
    custom_fields?: Record<string, unknown>;
    related?: unknown;
  }) => void;
  register: (handle: ContributionLifecycleHandle) => () => void;
};

export const ContributionLifecycleContext =
  createContext<ContributionLifecycleApi | null>(null);

export function useContributionLifecycle(): ContributionLifecycleApi | null {
  return useContext(ContributionLifecycleContext);
}
