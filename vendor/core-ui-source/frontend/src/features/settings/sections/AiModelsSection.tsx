import { PageMeta } from "../../../components/ui";
/**
 * Settings tab — user AI model and API key configuration.
 */
import { Text } from "../../../ui";
import { AiConfigurationSection } from "./AiConfigurationSection";

export function AiModelsSection({
  navigateToSection,
}: { navigateToSection?: (id: string) => void } = {}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text variant="heading-md" weight="semibold" as="h2">
          AI Models
        </Text>
        <PageMeta as="p">
          Connect your providers and choose how Integral works with your models.
        </PageMeta>
      </div>
      <AiConfigurationSection navigateToSection={navigateToSection} />
    </div>
  );
}
