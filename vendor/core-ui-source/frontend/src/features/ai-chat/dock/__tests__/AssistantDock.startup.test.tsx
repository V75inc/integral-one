import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantDockProvider, useAssistantDock } from '../../../../context/AssistantDockContext';
import { consumePendingChatDraft, requestOpenCompanionChat } from '../../chatHandoff';
import { AssistantDock } from '../AssistantDock';

vi.mock('../../../../hooks/useMediaQuery', () => ({ useIsMdUp: () => true }));
vi.mock('../../../../hooks/useOverlayPresence', () => ({ useRegisterOverlay: () => {} }));
// Stub only the runtime internals: the real dock and its provider must make the
// interface available synchronously, without an additional module-load promise.
vi.mock('../AssistantDockBody', () => ({ default: ({ onClose }: { onClose: () => void }) => (
  <div><textarea aria-label="Message input" /><button onClick={onClose}>Close chat</button></div>
) }));

function OpenControl() {
  const { openDock } = useAssistantDock();
  return <button onClick={() => openDock()}>Open chat</button>;
}
function renderDock() {
  return render(<MemoryRouter initialEntries={['/apps']}>
    <AssistantDockProvider><OpenControl /><AssistantDock /></AssistantDockProvider>
  </MemoryRouter>);
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(cleanup);

describe('Quick Access Chat startup', () => {
  it('renders the interface on the first mount after a reload with a restored open dock', () => {
    localStorage.setItem('integral:assistant-dock:open', '1');
    renderDock();
    expect(screen.getByRole('textbox', { name: 'Message input' })).toBeVisible();
    expect(screen.queryByText('Loading chat…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close chat' })).toBeEnabled();
  });

  it('opens immediately and retains a contextual draft for the composer to consume', () => {
    const draft = 'Review the focused view and show a diff. Do not publish.';
    requestOpenCompanionChat({ draftText: draft });
    renderDock();
    expect(screen.getByRole('textbox', { name: 'Message input' })).toBeVisible();
    // The dock must not consume or execute the draft before the real composer
    // is ready. Composer handoff tests cover its later one-time insertion.
    expect(consumePendingChatDraft()).toBe(draft);
    fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));
    expect(screen.queryByRole('textbox', { name: 'Message input' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
    expect(screen.getByRole('textbox', { name: 'Message input' })).toBeVisible();
  });
});
