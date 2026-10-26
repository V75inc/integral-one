import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SkillEditorModal } from './SkillEditorModal';

const { get, catalogue, onClose, toast } = vi.hoisted(() => ({ get: vi.fn(), catalogue: vi.fn(), onClose: vi.fn(), toast: { showToast: vi.fn() } }));
vi.mock('../../api/skills', () => ({ skillsApi: { get, toolCatalogue: catalogue } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => vi.fn() }));
vi.mock('./SkillRichEditor', () => ({ SkillRichEditor: () => <div>Skill instructions editor</div> }));
vi.mock('../ui/MarkdownContent', () => ({ MarkdownContent: ({ children }: { children: string }) => <div>{children}</div> }));
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  get.mockResolvedValue({ id: 'skill-1', name: 'Review', source: 'workspace', read_only: false, description: 'Review a record', domain_body: 'Read the record first.', tools_required: ['integral_get_entry'] });
  catalogue.mockResolvedValue({ tools: [{ name: 'integral_get_entry', friendly_label: 'Read Entry', description: '', param_summary: '' }], total: 1 });
});
it('opens instructions without fetching editor tools, then loads the catalogue on edit', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SkillEditorModal open skillId="skill-1" canManage onClose={onClose} onSaved={vi.fn()} /></QueryClientProvider>);
  await screen.findByText('Read the record first.');
  expect(catalogue).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
  await waitFor(() => expect(catalogue).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/Unknown tools:/)).not.toBeInTheDocument();
});
