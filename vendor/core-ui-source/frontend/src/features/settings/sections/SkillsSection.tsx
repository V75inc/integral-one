import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Lock, Search } from 'lucide-react';

import { skillsApi, type SkillSummary, type ToolCatalogueEntry } from '../../../api/skills';
import type { EffectiveSkillEntry } from '../../../api/skills';
import { useScope } from '../../../context/ScopeContext';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../components/ui/collapsible';
import { Input, Select, Stack, Surface, Text } from '../../../ui';
import { SettingsSection } from '../components/Field';
import { SkillEditorModal, skillBadges } from '../../../components/skills/SkillEditorModal';
import { useToast } from '../../../context/ToastContext';

function skillsQueryKey(workspaceId: string | undefined) {
  return ['skills', workspaceId] as const;
}

const BADGE_VARIANT: Record<string, string> = {
  Core: 'info',
  Customized: 'ai',
  'Default updated': 'warning',
  Disabled: 'default',
  'Code skill': 'default',
};

function matchesQuery(skill: SkillSummary, q: string): boolean {
  if (!q) return true;
  const hay = [skill.name, skill.description, skill.key, skill.namespaced_name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function matchesToolQuery(tool: ToolCatalogueEntry, q: string): boolean {
  if (!q) return true;
  return [tool.name, tool.friendly_label, tool.description, tool.param_summary]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function SkillRow({
  skill,
  onOpen,
  onToggle,
  canManage,
}: {
  skill: SkillSummary;
  onOpen: () => void;
  onToggle?: () => void;
  canManage: boolean;
}) {
  const badges = skillBadges(skill);
  return (
    <Surface
      tone="panel-2"
      border="subtle"
      radius="card"
      className="flex items-center justify-between gap-3 px-4 py-3 transition hover:border-[var(--panel-border)]"
    >
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={onOpen}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Text as="span" variant="body" weight="medium" truncate>
            {skill.name}
          </Text>
          {skill.source === 'workspace' && skill.app_id ? (
            <Badge variant="info">{skill.app_slug || 'app-scoped'}</Badge>
          ) : null}
          {badges.map(b => (
            <Badge key={b} variant={BADGE_VARIANT[b] ?? 'default'}>
              {b === 'Core' ? <Lock size={10} className="mr-1" /> : null}
              {b}
            </Badge>
          ))}
        </div>
        <Text as="p" variant="body-sm" tone="muted" className="mt-1 line-clamp-1">
          {skill.description || skill.namespaced_name || skill.key}
        </Text>
      </button>
      {canManage && skill.source !== 'core' && onToggle ? (
        <button
          type="button"
          role="switch"
          aria-checked={skill.enabled}
          aria-label={`${skill.enabled ? 'Disable' : 'Enable'} skill ${skill.name}`}
          onClick={onToggle}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)] ${
            skill.enabled ? 'bg-[var(--brand-accent)]' : 'bg-[var(--badge-muted-bg)]'
          }`}
        >
          <span
            aria-hidden
            className={`inline-block h-4 w-4 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform duration-fast ${
              skill.enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
            }`}
          />
        </button>
      ) : null}
    </Surface>
  );
}

function GroupHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <Text as="h3" variant="meta" weight="semibold" className="uppercase tracking-wide">
        {title}
      </Text>
      <Badge variant="default">{count}</Badge>
    </div>
  );
}

function SkillGroup({
  title,
  skills,
  onOpen,
  onToggle,
  canManage,
}: {
  title: string;
  skills: SkillSummary[];
  onOpen: (id: string) => void;
  onToggle: (skill: SkillSummary) => void;
  canManage: boolean;
}) {
  if (skills.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <GroupHeading title={title} count={skills.length} />
      <Stack gap="sm">
        {skills.map(skill => (
          <SkillRow
            key={skill.id}
            skill={skill}
            onOpen={() => onOpen(skill.id)}
            onToggle={() => onToggle(skill)}
            canManage={canManage}
          />
        ))}
      </Stack>
    </div>
  );
}

export function SkillsSection() {
  const { scope, activeWorkspace, isPersonal } = useScope();
  const workspaceId = scope?.workspaceId;
  const toast = useToast();
  const qc = useQueryClient();
  const [editorId, setEditorId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [focusedAppId, setFocusedAppId] = useState('');
  useEffect(() => {
    setFocusedAppId('');
  }, [workspaceId]);
  // Personal workspace = owner. Org workspace = admin/owner only (mirrors the
  // backend workspace-admin gate on skill writes).
  const canManage =
    isPersonal || activeWorkspace?.your_role === 'admin' || activeWorkspace?.your_role === 'owner';

  const { data, isLoading, isError } = useQuery({
    queryKey: skillsQueryKey(workspaceId),
    queryFn: () => skillsApi.list(),
    enabled: Boolean(workspaceId),
  });
  const { data: toolData, isLoading: toolsLoading } = useQuery({
    queryKey: ['skill-tools', workspaceId],
    queryFn: () => skillsApi.toolCatalogue(),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
  const effectiveQuery = useQuery({
    queryKey: ['effective-skills', workspaceId, focusedAppId],
    queryFn: () => skillsApi.effective(focusedAppId || null),
    enabled: Boolean(workspaceId),
  });

  const invalidateSkillQueries = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: skillsQueryKey(workspaceId) }),
      qc.invalidateQueries({ queryKey: ['effective-skills', workspaceId] }),
    ]);

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      skillsApi.update(id, { enabled }),
    onSuccess: invalidateSkillQueries,
    onError: () => toast.showToast('Failed to update skill', 'error'),
  });

  const onToggle = (skill: SkillSummary) =>
    toggleMutation.mutate({ id: skill.id, enabled: !skill.enabled });

  const q = query.trim().toLowerCase();

  const workspaceSkills = useMemo(
    () => (data?.workspace || []).filter(s => matchesQuery(s, q)),
    [data?.workspace, q],
  );

  const coreSkills = useMemo(
    () => (data?.core || []).filter(s => matchesQuery(s, q)),
    [data?.core, q],
  );

  const tools = useMemo(
    () => (toolData?.tools || []).filter(tool => matchesToolQuery(tool, q)),
    [toolData?.tools, q],
  );

  const appGroups = useMemo(() => {
    const byApp = new Map<string, SkillSummary[]>();
    for (const skill of data?.apps || []) {
      if (!matchesQuery(skill, q)) continue;
      const slug = skill.app_slug || 'app';
      const list = byApp.get(slug) || [];
      list.push(skill);
      byApp.set(slug, list);
    }
    return [...byApp.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data?.apps, q]);

  const appMatchCount = appGroups.reduce((n, [, s]) => n + s.length, 0);
  const filteredTotal = workspaceSkills.length + appMatchCount + coreSkills.length + tools.length;
  // A live search auto-reveals matching core skills so hits aren't hidden
  // behind the collapsed Advanced section.
  const coreOpen = advancedOpen || (q.length > 0 && coreSkills.length > 0);

  return (
    <SettingsSection
      title="AI Skills"
      description="View and customize the skills your workspace agent can use. Core skills are built in and read-only; app and workspace skills can be tailored to your workspace."
      actions={
        canManage ? (
          <Button onClick={() => setEditorId('__new__')}>New skill</Button>
        ) : undefined
      }
    >
      {isLoading || toolsLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : isError ? (
        <EmptyState title="Could not load skills" />
      ) : (
        <Stack gap="lg">
          <div className="relative">
            <Text
              as="span"
              tone="muted"
              className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2"
            >
              <Search size={15} />
            </Text>
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search skills and tools…"
              aria-label="Search skills and tools"
              style={{ paddingLeft: '2.25rem' }}
            />
          </div>

          <EffectiveSkillsPanel
            data={effectiveQuery.data}
            loading={effectiveQuery.isLoading}
            focusedAppId={focusedAppId}
            onFocusChange={setFocusedAppId}
            query={q}
          />

          {(data?.total || 0) === 0 && (toolData?.total || 0) === 0 ? (
            <EmptyState title="No skills or tools are available here" />
          ) : filteredTotal === 0 ? (
            <EmptyState title={`No skills match “${query.trim()}”`} />
          ) : (
            <Stack gap="lg">
              <SkillGroup
                title="Workspace skills"
                skills={workspaceSkills}
                onOpen={setEditorId}
                onToggle={onToggle}
                canManage={canManage}
              />
              {appGroups.map(([slug, skills]) => (
                <SkillGroup
                  key={slug}
                  title={slug}
                  skills={skills}
                  onOpen={setEditorId}
                  onToggle={onToggle}
                  canManage={canManage}
                />
              ))}

              {coreSkills.length > 0 ? (
                <Collapsible open={coreOpen} onOpenChange={setAdvancedOpen}>
                  {/* CollapsibleTrigger is a real Radix button — routing it
                      through <Surface as="button"> would drop the onClick/
                      aria-expanded/data-state props Radix's asChild clones
                      onto the child, since Surface doesn't forward rest
                      props. Nesting the trigger inside a Surface instead
                      keeps Radix's native wiring intact and still gets the
                      typed background/border. */}
                  <Surface
                    tone="panel-2"
                    border="subtle"
                    radius="card"
                    className="transition hover:border-[var(--panel-border)]"
                  >
                    <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
                      <span className="flex items-center gap-2">
                        <Text as="span" tone="muted">
                          <Lock size={14} />
                        </Text>
                        <Text as="span" variant="body" weight="medium">
                          Advanced · Core skills
                        </Text>
                        <Badge variant="default">{coreSkills.length}</Badge>
                      </span>
                      <Text
                        as="span"
                        tone="muted"
                        className="flex transition-transform group-data-[state=open]:rotate-180"
                      >
                        <ChevronDown size={16} />
                      </Text>
                    </CollapsibleTrigger>
                  </Surface>
                  <CollapsibleContent className="pt-2">
                    <Stack gap="sm">
                      <Text as="p" variant="body-sm" tone="muted" className="px-1">
                        Built-in skills that power the agent. These are read-only.
                      </Text>
                      {coreSkills.map(skill => (
                        <SkillRow
                          key={skill.id}
                          skill={skill}
                          onOpen={() => setEditorId(skill.id)}
                          canManage={canManage}
                        />
                      ))}
                    </Stack>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
              {tools.length > 0 ? (
                <details key={q ? 'filtered-tools' : 'all-tools'} open={Boolean(q)} className="flex flex-col gap-2">
                  <summary className="cursor-pointer py-3"><Text as="span" variant="body-sm" weight="medium">Advanced · Available tools ({tools.length})</Text></summary>
                  <Surface
                    tone="panel-2"
                    border="subtle"
                    radius="card"
                    className="divide-y divide-[var(--panel-border)] overflow-hidden"
                  >
                    {tools.map(tool => (
                      <div
                        key={tool.name}
                        className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(9rem,0.8fr)_minmax(0,2fr)] sm:gap-4"
                      >
                        <div className="min-w-0">
                          <Text as="p" variant="body-sm" weight="medium" className="truncate">
                            {tool.friendly_label || tool.name}
                          </Text>
                          <Text as="p" variant="meta" tone="muted" className="truncate">
                            {tool.name}
                          </Text>
                        </div>
                        <Text as="p" variant="body-sm" tone="muted">
                          {tool.description || tool.param_summary}
                        </Text>
                      </div>
                    ))}
                  </Surface>
                </details>
              ) : null}
            </Stack>
          )}
        </Stack>
      )}

      <SkillEditorModal
        open={editorId !== null}
        skillId={editorId}
        canManage={canManage}
        onClose={() => setEditorId(null)}
        onSaved={() => {
          void invalidateSkillQueries();
        }}
      />
    </SettingsSection>
  );
}

function matchesEffectiveSkill(skill: EffectiveSkillEntry, q: string): boolean {
  if (!q) return true;
  const hay = [skill.name, skill.description, skill.key, skill.app_name, skill.reason]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function matchesEffectiveTool(
  tool: { name: string; description: string },
  q: string,
): boolean {
  if (!q) return true;
  return [tool.name, tool.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function EffectiveSkillsPanel({
  data,
  loading,
  focusedAppId,
  onFocusChange,
  query,
}: {
  data?: Awaited<ReturnType<typeof skillsApi.effective>>;
  loading: boolean;
  focusedAppId: string;
  onFocusChange: (id: string) => void;
  query: string;
}) {
  const stateLabel: Record<EffectiveSkillEntry['state'], string> = {
    available: 'Available',
    offer_first: 'Ask first',
    paused: 'Paused',
    unavailable: 'Not loaded',
  };
  const skills = useMemo(
    () => (data?.skills || []).filter(s => matchesEffectiveSkill(s, query)),
    [data?.skills, query],
  );
  const tools = useMemo(
    () => (data?.tools || []).filter(t => matchesEffectiveTool(t, query)),
    [data?.tools, query],
  );
  const noMatch = Boolean(query) && skills.length === 0 && tools.length === 0;

  return (
    <Surface tone="panel-2" border="subtle" radius="card" className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Text as="h3" variant="body" weight="semibold">Skills and tools available here</Text>
          <Text as="p" variant="meta" tone="muted" className="mt-1">
            Permission-filtered for this workspace and App focus. Private skills you cannot access are not listed.
          </Text>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Text as="span" variant="label">App focus</Text>
          <Select
            aria-label="App focus for available skills"
            value={focusedAppId}
            onChange={event => onFocusChange(event.target.value)}
          >
            <option value="">Workspace</option>
            {(data?.apps ?? []).map(app => (
              <option key={app.id} value={app.id}>{app.name}</option>
            ))}
          </Select>
        </label>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-16 w-full" />
      ) : data ? (
        noMatch ? (
          <Text as="p" variant="body-sm" tone="muted" className="mt-4">
            No available skills or tools match “{query}”.
          </Text>
        ) : (
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div>
              <Text as="h4" variant="meta" weight="semibold" tone="subtle" className="mb-2 block uppercase tracking-[0.08em]">
                Skills ({skills.length})
              </Text>
              <ul className="space-y-2">
                {skills.map(skill => (
                  <li key={skill.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <Text variant="body" weight="medium">{skill.name}</Text>
                      {skill.app_name ? <Text className="ml-2" variant="body" tone="subtle">· {skill.app_name}</Text> : null}
                      {skill.reason ? <Text as="span" className="mt-0.5 block" variant="body-sm" tone="muted">{skill.reason}</Text> : null}
                    </span>
                    <Text className="shrink-0" variant="body-sm" tone="muted">{stateLabel[skill.state]}</Text>
                  </li>
                ))}
                {skills.length === 0 ? <li><Text variant="body" tone="muted">No skills available.</Text></li> : null}
              </ul>
            </div>
            <Surface as="details" tone="panel" border="default" radius="card" padding="md" className="min-w-0 self-start">
              <Text as="summary" variant="body-sm" weight="medium" className="cursor-pointer">
                Tools Integral can use ({tools.length})
              </Text>
              <Text as="p" variant="body-sm" tone="muted" className="mt-2">
                For advanced setup and troubleshooting.
              </Text>
              <ul className="mt-3 grid gap-x-3 gap-y-1 border-t border-[var(--panel-border)] pt-3 sm:grid-cols-2">
                {tools.map(tool => (
                  <li key={`${tool.source}:${tool.name}`} className="truncate" title={tool.description}>
                    <Text variant="body-sm" tone="muted">{tool.name}</Text>
                  </li>
                ))}
              </ul>
            </Surface>
          </div>
        )
      ) : (
        <Text as="p" variant="body-sm" tone="muted" className="mt-4">Could not load the effective turn catalogue.</Text>
      )}
    </Surface>
  );
}
