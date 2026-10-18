import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillsSection } from '../SkillsSection';

const { listSkills, listTools, effectiveSkills } = vi.hoisted(() => ({
  listSkills: vi.fn(),
  listTools: vi.fn(),
  effectiveSkills: vi.fn(),
}));

vi.mock('../../../../api/skills', () => ({
  skillsApi: {
    list: listSkills,
    toolCatalogue: listTools,
    effective: effectiveSkills,
    update: vi.fn(),
  },
}));

vi.mock('../../../../context/ScopeContext', () => ({
  useScope: () => ({
    scope: { workspaceId: 'workspace-1' },
    activeWorkspace: { id: 'workspace-1', your_role: 'admin' },
    isPersonal: false,
  }),
}));

vi.mock('../../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../../../components/skills/SkillEditorModal', () => ({
  SkillEditorModal: () => null,
  skillBadges: () => [],
}));

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SkillsSection />
    </QueryClientProvider>,
  );
}

describe('AI Skills search', () => {
  it('keeps the technical tool catalogue collapsed until requested', async () => {
    renderSection();
    const summary = await screen.findByText('Advanced · Available tools (2)');
    const details = summary.closest('details')!;
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
  });

  beforeEach(() => {
    listSkills.mockResolvedValue({
      total: 2,
      workspace: [],
      apps: [],
      core: [
        {
          id: 'skill-workspace',
          source: 'core',
          name: 'Workspace',
          description: 'Manage workspace context',
          key: 'workspace',
          kind: 'prompt',
          read_only: true,
          enabled: true,
          customized: false,
          stale_default: false,
          tools_required: [],
        },
        {
          id: 'skill-filing',
          source: 'core',
          name: 'Filing',
          description: 'Organize documents',
          key: 'filing',
          kind: 'prompt',
          read_only: true,
          enabled: true,
          customized: false,
          stale_default: false,
          tools_required: [],
        },
      ],
    });
    listTools.mockResolvedValue({
      total: 2,
      tools: [
        {
          name: 'integral_workspace_setup',
          friendly_label: 'Workspace setup',
          description: 'Prepare a workspace',
          param_summary: '',
        },
        {
          name: 'integral_query',
          friendly_label: 'Query records',
          description: 'Search records',
          param_summary: '',
        },
      ],
    });
    effectiveSkills.mockResolvedValue({
      workspace_id: 'workspace-1',
      focused_app_id: null,
      apps: [],
      skills: [
        {
          id: 'eff-workspace',
          key: 'workspace',
          name: 'Workspace',
          description: 'Manage workspace context',
          source: 'core',
          state: 'available',
          tools_required: [],
        },
        {
          id: 'eff-filing',
          key: 'filing',
          name: 'Filing',
          description: 'Organize documents',
          source: 'core',
          state: 'available',
          tools_required: [],
        },
      ],
      tools: [
        {
          name: 'integral_workspace_setup',
          description: 'Prepare a workspace',
          source: 'core',
        },
        {
          name: 'integral_query',
          description: 'Search records',
          source: 'core',
        },
      ],
    });
  });

  it('filters skills and tools together as the user types', async () => {
    renderSection();
    const search = await screen.findByRole('textbox', { name: 'Search skills and tools' });
    fireEvent.change(search, { target: { value: 'Workspace' } });

    await waitFor(() => {
      expect(screen.getAllByText('integral_workspace_setup').length).toBeGreaterThan(0);
      expect(screen.getByText('Workspace setup')).toBeInTheDocument();
      expect(screen.queryByText('Filing')).not.toBeInTheDocument();
      expect(screen.queryByText('Query records')).not.toBeInTheDocument();
    });
  });

  it('filters the effective available panel with the same query', async () => {
    renderSection();
    expect(await screen.findByText('Skills and tools available here')).toBeInTheDocument();
    expect(await screen.findByText('Skills (2)')).toBeInTheDocument();

    const search = await screen.findByRole('textbox', { name: 'Search skills and tools' });
    fireEvent.change(search, { target: { value: 'Workspace' } });

    await waitFor(() => {
      expect(screen.getByText('Skills (1)')).toBeInTheDocument();
      expect(screen.getByText('Tools Integral can use (1)')).toBeInTheDocument();
      expect(screen.queryByText('Filing')).not.toBeInTheDocument();
    });
  });

  it('shows a no-match message when neither skills nor tools match', async () => {
    renderSection();
    const search = await screen.findByRole('textbox', { name: 'Search skills and tools' });
    fireEvent.change(search, { target: { value: 'missing-capability' } });

    expect(await screen.findByText('No skills match “missing-capability”')).toBeInTheDocument();
    expect(
      await screen.findByText('No available skills or tools match “missing-capability”.'),
    ).toBeInTheDocument();
  });
});
