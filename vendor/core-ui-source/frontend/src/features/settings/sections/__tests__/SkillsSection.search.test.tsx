import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillsSection } from '../SkillsSection';

const { browse, effective, tools, update, toast, scope } = vi.hoisted(() => ({
  browse: vi.fn(),
  effective: vi.fn(),
  tools: vi.fn(),
  update: vi.fn(),
  toast: vi.fn(),
  scope: { workspaceId: 'workspace-1' },
}));
vi.mock('../../../../api/skills', () => ({
  skillsApi: { browse, effective, toolCatalogue: tools, update },
}));
vi.mock('../../../../context/ScopeContext', () => ({
  useScope: () => ({
    scope: { workspaceId: scope.workspaceId },
    activeWorkspace: { your_role: 'admin' },
    isPersonal: false,
  }),
}));
vi.mock('../../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: toast }),
}));
vi.mock('../../../../components/skills/SkillEditorModal', () => ({
  SkillEditorModal: ({ open, skillId }: { open: boolean; skillId: string }) =>
    open ? <div role="dialog">{skillId}</div> : null,
}));

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <SkillsSection />
    </QueryClientProvider>,
  );
  return { ...view, client };
}
function skill(i: number) {
  return {
    id: `skill-${i}`,
    name: `Skill ${i}`,
    key: `skill_${i}`,
    source: 'app',
    app_id: 'app-1',
    app_name: 'Operations',
    description: 'A short description',
    enabled: true,
    customized: false,
    read_only: false,
    tools_required: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  scope.workspaceId = 'workspace-1';
  browse.mockImplementation(async (params) => ({
    skills: Array.from({ length: params.page === 1 ? 10 : 2 }, (_, i) =>
      skill((params.page - 1) * 10 + i),
    ),
    apps: [{ id: 'app-1', name: 'Operations' }],
    total: 12,
    page: params.page,
    total_pages: 2,
    page_size: 10,
  }));
});

describe('Paged Skills browsing', () => {
  it('makes one bounded browse read and leaves technical catalogues unloaded', async () => {
    mount();
    const list = await screen.findByRole('list', { name: 'Skills' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    expect(effective).not.toHaveBeenCalled();
    expect(tools).not.toHaveBeenCalled();
    expect(browse).toHaveBeenCalledTimes(1);
    expect(browse).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, page_size: 10 }),
    );
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Previous skills pages' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next skills pages' }));
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Skills' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Next skills pages' }),
    ).toBeDisabled();
  });

  it('debounces name search and resets paging and filters together', async () => {
    mount();
    await screen.findByText('Page 1 of 2');
    fireEvent.click(screen.getByRole('button', { name: 'Next skills pages' }));
    await screen.findByText('Page 2 of 2');
    const search = screen.getByRole('textbox', { name: 'Search skill names' });
    fireEvent.change(search, { target: { value: 'S' } });
    fireEvent.change(search, { target: { value: 'Skill' } });
    await waitFor(() =>
      expect(browse).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'Skill', page: 1 }),
      ),
    );
    expect(browse.mock.calls.filter(([args]) => args.search)).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Filter by App'), {
      target: { value: 'app-1' },
    });
    await waitFor(() =>
      expect(browse).toHaveBeenLastCalledWith(
        expect.objectContaining({ app_id: 'app-1' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(search).toHaveValue(''));
    expect(screen.getByLabelText('Filter by App')).toHaveValue('');
    expect(screen.getByLabelText('Skill source')).toHaveValue('all');
  });

  it('keeps skill detail selection and new-skill authoring available', async () => {
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'View skill Skill 0' }),
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('skill-0');
    fireEvent.click(screen.getByRole('button', { name: 'New skill' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('__new__');
  });

  it('reports updates through toasts and refreshes the current page', async () => {
    update.mockResolvedValue({});
    mount();
    fireEvent.click(
      await screen.findByRole('switch', { name: 'Disable skill Skill 0' }),
    );
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('skill-0', { enabled: false }),
    );
    expect(toast).toHaveBeenCalledWith('Skill disabled', 'success');
    await waitFor(() => expect(browse.mock.calls.length).toBeGreaterThan(1));
  });

  it('does not flash rows from the previous workspace', async () => {
    const view = mount();
    await screen.findByText('Skill 0');
    browse.mockImplementation(() => new Promise(() => {}));
    scope.workspaceId = 'workspace-2';
    view.rerender(
      <QueryClientProvider client={view.client}>
        <SkillsSection />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('Skill 0')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
