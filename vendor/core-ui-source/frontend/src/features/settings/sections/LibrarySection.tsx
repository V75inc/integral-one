import { PageMeta } from '../../../components/ui';
/**
 * Settings → Operational Models — slim explainer.
 *
 * The full catalog lives at /models. This panel shows a brief
 * description and a count of installed profiles, then points the user
 * to the canonical catalog page.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';

import { operationalModelsApi } from '../../../api/operationalModels';
import { SettingsSection } from '../components/Field';
import { Button, Skeleton } from '../../../components/ui';
import { Text } from '../../../ui';

const LIBRARY_QUERY_KEY = ['library', 'list'] as const;

export function LibrarySection() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: LIBRARY_QUERY_KEY,
    queryFn: () => operationalModelsApi.list(),
  });

  const packages = useMemo(() => data ?? [], [data]);
  const platformCount = useMemo(
    () => packages.filter(cp => cp.scope === 'platform').length,
    [packages],
  );
  const totalCount = packages.length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Text variant="heading-md" weight="semibold" as="h2">
          Operational Models
        </Text>
        <PageMeta as="p">
          Reusable models and App Packages that define records, views,
          operational guidance, skills, agents, and settings.
        </PageMeta>
      </div>

      <SettingsSection
        title="Available models"
        description="The catalog page lets you browse every available model or App Package and import one."
      >
        {isError ? <div role="alert"><Text as="p" variant="body-sm" tone="danger">Could not load available models.</Text><Button variant="secondary" size="sm" onClick={() => void refetch()}>Try again</Button></div> : isLoading ? <Skeleton className="h-6 w-40" /> : totalCount > 0 ? (
          <Text variant="body" tone="muted" as="p">
            {totalCount} {totalCount === 1 ? 'model' : 'models'} available
            {platformCount > 0 && (
              <>, {platformCount} platform-scoped</>
            )}
            .
          </Text>
        ) : <Text as="p" variant="body-sm" tone="muted">No models available yet.</Text>}

        <div>
          <Link
            to="/models"
            className="
              inline-flex items-center gap-1.5
              rounded-[var(--radius-input)]
              bg-[var(--cta-bg)] hover:bg-[var(--cta-hover)]
              text-[var(--cta-fg)]
              px-3 py-1.5 text-sm font-medium
              shadow-sm
              transition-colors duration-fast
            "
          >
            Browse catalog
            <ArrowRight size={14} strokeWidth={1.5} />
          </Link>
        </div>
      </SettingsSection>
    </div>
  );
}
