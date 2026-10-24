import { useQuery } from '@tanstack/react-query';
import { getBuildMetadata } from '../../../api/meta';
import { PageMeta } from '../../../components/ui';
import { SettingsSection } from '../components/Field';
import { Text } from '../../../ui';

const DEVELOPER = import.meta.env.VITE_INTEGRAL_DEVELOPER || 'Integral';

export function AboutSection() {
  const build = useQuery({
    queryKey: ['build-metadata'],
    queryFn: getBuildMetadata,
    staleTime: 60_000,
    retry: false,
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Text variant="heading-md" weight="semibold" as="h2">
          About
        </Text>
        <PageMeta as="p">
          Product information and release details.
        </PageMeta>
      </div>

      <SettingsSection
        title="Integral"
        description="An AI-native workspace where people and a resident AI collaborate over a single, structured body of knowledge. Apps install onto the workspace as ready-to-use surfaces — schema, automations, and agent skills bundled together."
      >
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
          <Text variant="body" tone="subtle" as="dt">Integral Core</Text>
          <Text variant="mono" as="dd" tone="default" aria-live="polite">
            {build.isPending ? 'Loading…' : build.data?.core_version || 'Unavailable'}
          </Text>
          <Text variant="body" tone="subtle" as="dt">Developer</Text>
          <Text variant="body" as="dd">{DEVELOPER}</Text>
        </dl>
      </SettingsSection>
    </div>
  );
}
