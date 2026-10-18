import { Text } from '../../../ui';
import { useAssistantDock } from '../../../context/AssistantDockContext';
import { useAgentInbox } from './useAgentInbox';
import './inbox.css';

/**
 * Chat | Inbox switch for the assistant surfaces.
 *
 * Shared rather than copied: the dock and the full-page `/agent` view are two
 * renderings of the same assistant, and a tab pair that exists in one but not
 * the other is how the inbox ended up invisible at full screen in the first
 * place.
 *
 * The selected view comes from `AssistantDockContext`, which is mounted above
 * the router — so expanding the dock to full screen (or collapsing back) keeps
 * whichever tab you were on instead of silently resetting to Chat.
 */
export interface AssistantViewTabsProps {
  /**
   * `chrome` renders the pair as a bordered pill sized to match the top bar's
   * icon buttons, so it reads as part of that cluster rather than as loose
   * text dropped beside them.
   */
  variant?: 'plain' | 'chrome';
}

export function AssistantViewTabs({ variant = 'plain' }: AssistantViewTabsProps = {}) {
  const { view, setView } = useAssistantDock();
  // Mounted on both tabs on purpose: a count you only see after switching to
  // the Inbox tab is not a notification.
  const { actionableCount } = useAgentInbox();

  return (
    <div
      className={
        variant === 'chrome'
          ? 'assistant-view-tabs--chrome'
          : 'flex min-w-0 items-center justify-center gap-1'
      }
    >
      <Tab
        active={view === 'chat'}
        onClick={() => setView('chat')}
        label="Chat"
      />
      <Tab
        active={view === 'inbox'}
        onClick={() => setView('inbox')}
        label="Inbox"
        count={actionableCount}
      />
    </div>
  );
}

/** The count is the whole point of the Inbox tab, so it renders inline. */
function Tab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="dock-tab rounded-md px-2 py-1"
    >
      <Text variant="meta" weight="medium" tone={active ? 'default' : 'muted'}>
        {label}
      </Text>
      {count ? (
        <span className="dock-tab-count" aria-label={`${count} awaiting you`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
