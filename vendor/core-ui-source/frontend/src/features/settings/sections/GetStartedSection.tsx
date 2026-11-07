import { PageMeta } from '../../../components/ui';
/**
 * Thin Get Started section — destination for the first-login banner
 * (`OnboardingGetStartedBanner` → `/settings#get-started`).
 */
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { MessageSquare, LayoutGrid, ListIcon, Brain } from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { LINE_ICON_STROKE } from '../../../components/ui';
import { Text } from '../../../ui';
import { SettingsSection } from '../components/Field';
import { Modal } from '../../../components/ui/Modal';

interface GetStartedSectionProps {
  navigateToSection?: (id: string) => void;
}

export function GetStartedSection({
  navigateToSection,
}: GetStartedSectionProps = {}) {
  const navigate = useNavigate();
  const [introductionOpen, setIntroductionOpen] = useState(false);

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

      <SettingsSection title="Learn the basics" description="An App brings related work together. Tracks organize ongoing work, and Entries hold individual records and updates.">
        <Button type="button" variant="secondary" size="sm" onClick={() => setIntroductionOpen(true)}>
          Review introduction
        </Button>
      </SettingsSection>

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

      <SettingsSection title="Find and share your work">
        <Text as="p">Search or filter Feed and Tracks to find Entries. Use tags to group related work. Share an App, Track or Entry to give colleagues access, and review their permissions before sharing.</Text>
      </SettingsSection>
      <SettingsSection title="Stay up to date">
        <Text as="p">Open Notifications for mentions and updates. Use Settings to manage your profile, notification preferences and AI providers.</Text>
      </SettingsSection>

      <Modal open={introductionOpen} onClose={() => setIntroductionOpen(false)} title="Welcome to Integral">
        <Modal.Body>
          <div className="space-y-4">
            <Text as="p">Apps bring related work together. For example, an App can organize a project or a part of your life.</Text>
            <Text as="p">Tracks keep related work in one place, such as expenses or contacts.</Text>
            <Text as="p">Entries are the individual records, notes and updates in a Track.</Text>
            <Text as="p">Ask Integral to help you set up an App, or explore Apps and Tracks yourself.</Text>
          </div>
        </Modal.Body>
        <Modal.Footer><Button type="button" onClick={() => setIntroductionOpen(false)}>Done</Button></Modal.Footer>
      </Modal>
    </div>
  );
}
