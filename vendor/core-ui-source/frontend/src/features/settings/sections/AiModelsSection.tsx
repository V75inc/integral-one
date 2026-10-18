import { PageMeta } from '../../../components/ui';
/**
 * Settings tab — user AI model and API key configuration.
 */
import { Text } from '../../../ui';
import { ModelCredentialsSection } from './ModelCredentialsSection';

export function AiModelsSection() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text variant="heading-md" weight="semibold" as="h2">
          AI Models
        </Text>
        <PageMeta as="p">
          Connect your AI provider and choose your primary chat model and optional
          voice input.
        </PageMeta>
      </div>
      <ModelCredentialsSection />
    </div>
  );
}
