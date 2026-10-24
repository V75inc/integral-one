import { PageMeta } from '../../../components/ui';
/**
 * Thin Get Started section — destination for the first-login banner
 * (`OnboardingGetStartedBanner` → `/settings#get-started`).
 */
import { useNavigate } from 'react-router-dom';
import { MessageSquare, LayoutGrid, ListIcon, Brain } from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { LINE_ICON_STROKE } from '../../../components/ui';
import { Text } from '../../../ui';
import { SettingsSection } from '../components/Field';

interface GetStartedSectionProps {
  navigateToSection?: (id: string) => void;
}

export function GetStartedSection({
  navigateToSection,
}: GetStartedSectionProps = {}) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Text variant="heading-md" weight="semibold" as="h2">
          Get started
        </Text>
        <PageMeta as="p">
          A few simple ways to make Integral useful for your everyday work.
        </PageMeta>
      </div>

      <SettingsSection
        title="Talk to your coworker"
        description="Ask a question, write an update, or get help organizing your workspace."
      >
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={<MessageSquare size={14} strokeWidth={LINE_ICON_STROKE} />}
          onClick={() => navigate('/agent')}
        >
          Ask Integral
        </Button>
      </SettingsSection>

      <SettingsSection
        title="Organize work"
        description="Use a track to collect related notes and updates, or add an app for a larger area of work."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<ListIcon size={14} strokeWidth={LINE_ICON_STROKE} />}
            onClick={() => navigate('/tracks')}
          >
            Tracks
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<LayoutGrid size={14} strokeWidth={LINE_ICON_STROKE} />}
            onClick={() => navigate('/apps')}
          >
            Apps
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Connect your AI model"
        description="Integral AI is already active. Connect a cloud provider or local Ollama model to start working with it."
      >
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Brain size={14} strokeWidth={LINE_ICON_STROKE} />}
          onClick={() => navigateToSection?.('ai-models')}
        >
          Connect a model
        </Button>
      </SettingsSection>
    </div>
  );
}
