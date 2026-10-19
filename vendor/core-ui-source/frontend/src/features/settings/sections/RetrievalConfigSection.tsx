import { PageMeta } from '../../../components/ui';
/**
 * Read-only viewer for the workspace's search defaults. The values are
 * controlled by the deployment operator — end users cannot change them
 * from this surface.
 */
import { useQuery } from '@tanstack/react-query';

import {
  retrievalConfigApi,
  type RetrievalConfigResponse,
} from '../../../api/retrievalConfig';
import { Pill } from '../../../components/ui/Pill';
import { Skeleton } from '../../../components/ui/Skeleton';
import { SettingsField, SettingsSection, StatusPill } from '../components/Field';
import { Text } from '../../../ui';

const RETRIEVAL_CONFIG_QUERY_KEY = ['retrieval-config'] as const;

interface RetrievalConfigSectionProps {
  /** When true, suppresses the standalone heading/description — use when
   *  embedded inside another section (e.g. Search tab). */
  embedded?: boolean;
}

export function RetrievalConfigSection({ embedded }: RetrievalConfigSectionProps = {}) {
  const { data, isLoading, isError, error } = useQuery<RetrievalConfigResponse>({
    queryKey: RETRIEVAL_CONFIG_QUERY_KEY,
    queryFn: () => retrievalConfigApi.get(),
    staleTime: 30_000,
  });

  const card = (
    <SettingsSection
      title="Search defaults"
      description="Deployment-level defaults — read-only. Contact your administrator to change."
    >
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : isError ? (
          <p className="text-sm text-[var(--danger-fg)]">
            Couldn't load search defaults:{' '}
            {(error as Error | undefined)?.message ?? 'unknown error'}
          </p>
        ) : data ? (
          <>
            <SettingsField
              label="Pre-load AI model"
              hint="When enabled, the semantic model is ready the moment Integral starts."
              inline
            >
              {data.embedding_model_eager_load ? (
                <StatusPill state="ok">Enabled</StatusPill>
              ) : (
                <StatusPill state="idle">Disabled</StatusPill>
              )}
            </SettingsField>
            <SettingsField
              label="Search depth"
              hint="How many candidates Integral evaluates before ranking the final results."
              inline
            >
              <span className="font-mono text-sm text-[var(--text)]">
                {data.retrieve_k_default}
              </span>
            </SettingsField>
            <SettingsField
              label="Results per query"
              hint="Default number of results returned for each search."
              inline
            >
              <span className="font-mono text-sm text-[var(--text)]">
                {data.retrieve_top_n_default}
              </span>
            </SettingsField>
            <SettingsField
              label="Search backend"
              hint="Storage engine that holds the semantic index."
              inline
            >
              <Pill variant="neutral" tone="descriptive">
                {data.embedding_store_backend}
              </Pill>
            </SettingsField>
          </>
        ) : null}
    </SettingsSection>
  );

  if (embedded) return card;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Text variant="heading-md" weight="semibold" as="h2">Search defaults</Text>
        <PageMeta as="p">
          Deployment-level defaults — read-only. Contact your administrator to change.
        </PageMeta>
      </div>
      {card}
    </div>
  );
}
