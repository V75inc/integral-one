import { useDeployment } from '../hooks/useDeployment';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertOctagon,
  Bell,
  BookOpen,
  Bot,
  Cable,
  ChevronDown,
  Cpu,
  Info,
  Mic,
  Palette,
  ScrollText,
  Search,
  Settings as SettingsIcon,
  Share2,
  ShieldCheck,
  Sparkles,
  UserCircle,
  Wrench,
} from 'lucide-react';

import { useSettings } from '../features/settings/store';
import { AppearanceSection } from '../features/settings/sections/AppearanceSection';
import { AboutSection } from '../features/settings/sections/AboutSection';
import { getRegisteredSettingsSections } from '../host/registry';
import { Input, Text } from '../ui';
import type { SettingsSnapshot } from '../features/settings/types';
import { PageShell, PageSection } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';
import { usePublishPageContext } from '../hooks/usePublishPageContext';

// ── Lazy section imports — bodies live in plan-owned files ─────────────
const PoliciesSection = React.lazy(() =>
  import('../features/settings/sections/PoliciesSection').then(m => ({
    default: m.PoliciesSection,
  })),
);
const ConnectorsSection = React.lazy(() =>
  import('../features/settings/sections/ConnectorsSection').then(m => ({
    default: m.ConnectorsSection,
  })),
);
const ConflictsSection = React.lazy(() =>
  import('../features/settings/sections/ConflictsSection').then(m => ({
    default: m.ConflictsSection,
  })),
);
const AgentsSection = React.lazy(() =>
  import('../features/settings/sections/AgentsSection').then(m => ({
    default: m.AgentsSection,
  })),
);
const LibrarySection = React.lazy(() =>
  import('../features/settings/sections/LibrarySection').then(m => ({
    default: m.LibrarySection,
  })),
);
const RetrievalConfigSection = React.lazy(() =>
  import('../features/settings/sections/RetrievalConfigSection').then(m => ({
    default: m.RetrievalConfigSection,
  })),
);
const SharingSection = React.lazy(() =>
  import('../features/settings/sections/SharingSection').then(m => ({
    default: m.SharingSection,
  })),
);
const SearchModeSection = React.lazy(() =>
  import('../features/settings/sections/SearchModeSection').then(m => ({
    default: m.SearchModeSection,
  })),
);
// Phase 9 Plan 09-04 — Notifications section (NOTIF-03). Additive lazy
// import alongside the other downstream-plan sections; SettingsPage.tsx
// existed in Phase 8 with explicit extension points for this exact case.
const NotificationsSection = React.lazy(() =>
  import('../features/settings/sections/NotificationsSection').then(m => ({
    default: m.NotificationsSection,
  })),
);
// B-SET-01 — Profile / Account section.
const ProfileSection = React.lazy(() =>
  import('../features/settings/sections/ProfileSection').then(m => ({
    default: m.ProfileSection,
  })),
);
const AiModelsSection = React.lazy(() =>
  import('../features/settings/sections/AiModelsSection').then(m => ({
    default: m.AiModelsSection,
  })),
);
const SkillsSection = React.lazy(() =>
  import('../features/settings/sections/SkillsSection').then(m => ({
    default: m.SkillsSection,
  })),
);
const GetStartedSection = React.lazy(() =>
  import('../features/settings/sections/GetStartedSection').then(m => ({
    default: m.GetStartedSection,
  })),
);
// Chat dictation — per-user voice input preferences + provider status.
const VoiceInputSection = React.lazy(() =>
  import('../features/settings/sections/VoiceInputSection').then(m => ({
    default: m.VoiceInputSection,
  })),
);
const AuditLogSection = React.lazy(() =>
  import('../features/settings/sections/AuditLogSection').then(m => ({
    default: m.AuditLogSection,
  })),
);

// ── Section registry ───────────────────────────────────────────────────
// SectionId is intentionally `string` (not a Literal) so downstream plans
// can add ids additively without ever touching this file.
type SectionId = string;

interface SectionRenderCtx {
  settings: SettingsSnapshot;
  update: (
    next: SettingsSnapshot | ((prev: SettingsSnapshot) => SettingsSnapshot),
  ) => void;
  /** Programmatic nav between sections. Used for cross-section links
   *  (e.g. Providers ↔ Agents, Notifications → Connectors verify flow). */
  navigateToSection: (id: SectionId) => void;
}

interface Section {
  id: SectionId;
  label: string;
  icon: typeof Cpu;
  render: (ctx: SectionRenderCtx) => React.ReactNode;
}

// The registry defines content; GROUPS below defines navigation order.
const SECTIONS: Section[] = [
  {
    id: 'help',
    label: 'Help & about',
    icon: Info,
    render: ctx => <div className="flex flex-col gap-8"><GetStartedSection {...ctx} /><AboutSection /></div>,
  },
  {
    id: 'ai-models',
    label: 'AI Models',
    icon: Sparkles,
    render: () => <AiModelsSection />,
  },
  {
    id: 'skills',
    label: 'AI Skills',
    icon: Wrench,
    render: () => <SkillsSection />,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    render: ctx => <AppearanceSection {...ctx} />,
  },
  {
    id: 'audit-log',
    label: 'Audit log',
    icon: ScrollText,
    render: () => <AuditLogSection />,
  },
  {
    id: 'conflicts',
    label: 'Conflicts',
    icon: AlertOctagon,
    render: () => <ConflictsSection />,
  },
  {
    id: 'connectors',
    label: 'Connectors',
    icon: Cable,
    render: () => <ConnectorsSection />,
  },
  {
    id: 'library',
    label: 'Operational Models',
    icon: BookOpen,
    render: () => <LibrarySection />,
  },
  {
    id: 'agents',
    label: 'Connected agents',
    icon: Bot,
    render: ctx => <AgentsSection {...ctx} />,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    render: () => <NotificationsSection />,
  },
  {
    id: 'policies',
    label: 'Policies',
    icon: ShieldCheck,
    render: () => <PoliciesSection />,
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: UserCircle,
    render: () => <ProfileSection />,
  },
  {
    id: 'retrieval',
    label: 'Search',
    icon: Search,
    render: ctx => (
      <div className="flex flex-col gap-5">
        <SearchModeSection {...ctx} />
        <RetrievalConfigSection embedded />
      </div>
    ),
  },
  {
    id: 'sharing',
    label: 'Sharing',
    icon: Share2,
    render: () => <SharingSection />,
  },
  {
    id: 'voice-input',
    label: 'Voice input',
    icon: Mic,
    render: ctx => <VoiceInputSection navigateToSection={ctx.navigateToSection} />,
  },
];

const GROUPS = [
  { label: 'Your account', ids: ['profile', 'appearance', 'notifications', 'voice-input'] },
  { label: 'AI & connections', ids: ['ai-models', 'agents', 'skills', 'connectors'] },
  { label: 'Workspace', ids: ['retrieval', 'library', 'sharing'] },
  { label: 'Governance', ids: ['policies', 'conflicts', 'audit-log'] },
  { label: 'Help', ids: ['help'] },
];
const SECTION_ALIASES: Record<string, string> = { about: 'help', 'get-started': 'help' };

function allSections(): Section[] {
  return [...SECTIONS, ...getRegisteredSettingsSections().map(s => ({
    id: s.id, label: s.label, icon: s.icon, render: () => s.render(),
  }))];
}

function SettingsNavigation({ sections, active, query, onQuery, onSelect }: {
  sections: Section[];
  active: string;
  query: string;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
}) {
  const known = new Set(GROUPS.flatMap(g => g.ids));
  const groups = [...GROUPS, { label: 'Extensions', ids: sections.filter(s => !known.has(s.id)).map(s => s.id) }];
  const needle = query.trim().toLowerCase();
  const filtered = groups.map(g => ({ ...g, items: g.ids.map(id => sections.find(s => s.id === id)).filter((s): s is Section => !!s).filter(s => !needle || `${s.label} ${g.label}`.toLowerCase().includes(needle)) })).filter(g => g.items.length);
  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-4">
      <Input aria-label="Find a setting" placeholder="Find a setting…" value={query} onChange={e => onQuery(e.target.value)} />
      {filtered.map(group => (
        <div key={group.label} className="flex flex-col gap-1">
          <Text as="p" variant="meta" tone="subtle" weight="semibold" className="px-2">{group.label}</Text>
          {group.items.map(s => {
            const Icon = s.icon;
            return <button key={s.id} type="button" onClick={() => onSelect(s.id)} aria-current={s.id === active ? 'page' : undefined}
              className={`inline-flex min-h-10 w-full items-center gap-2 rounded-[var(--radius-input)] px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)] ${s.id === active ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]' : 'settings-nav-item'}`}>
              <Icon size={16} strokeWidth={1.75} aria-hidden />
              <Text as="span" variant="body-sm" tone={s.id === active ? 'inherit' : 'muted'}>{s.label}</Text>
            </button>;
          })}
        </div>
      ))}
      {!filtered.length && <Text as="p" variant="body-sm" tone="muted">No matching settings.</Text>}
    </nav>
  );
}

function SectionFallback() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function sectionFromHash(hash: string): SectionId | null {
  // Support deep-links like `#audit-log?action=policy.deny&resource_id=...`
  const raw = hash.replace(/^#/, '').trim();
  const value = (raw.split('?')[0] || '').trim();
  const id = SECTION_ALIASES[value] ?? value;
  if (!id) return null;
  return allSections().some(s => s.id === id) ? id : null;
}

export function SettingsPage() {
  const { singleUser } = useDeployment();
  const location = useLocation();
  const navigate = useNavigate();
  const hashSection = sectionFromHash(location.hash);
  const [activeFallback, setActiveFallback] = useState<SectionId>('profile');
  const requestedSection = hashSection ?? activeFallback;
  const active = singleUser && requestedSection === 'sharing' ? 'profile' : requestedSection;
  const [compactMenuOpen, setCompactMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const compactRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!compactMenuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!compactRef.current?.contains(event.target as Node)) setCompactMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCompactMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    const sizeMenu = () => {
      const trigger = triggerRef.current;
      const menu = compactRef.current?.querySelector<HTMLElement>('#settings-compact-nav');
      if (!trigger || !menu) return;
      const rect = trigger.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const upward = below < 200 && above > below;
      menu.style.top = upward ? 'auto' : 'calc(100% + 0.5rem)';
      menu.style.bottom = upward ? 'calc(100% + 0.5rem)' : 'auto';
      menu.style.setProperty('--settings-menu-space', `${Math.max(0, upward ? above : below)}px`);
    };
    window.addEventListener('resize', sizeMenu);
    document.addEventListener('scroll', sizeMenu, true);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    compactRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    sizeMenu();
    return () => {
      window.removeEventListener('resize', sizeMenu);
      document.removeEventListener('scroll', sizeMenu, true);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [compactMenuOpen]);

  // Which section is open — never its contents. Settings holds API keys,
  // connector credentials and model config, and page context is forwarded
  // to the backend with every turn.
  usePublishPageContext({
    pageKind: 'settings',
    metadata: { section: active },
  });
  const [settings, update] = useSettings();

  const navigateToSection = useCallback(
    (id: SectionId) => {
      const target = SECTION_ALIASES[id] ?? id;
      if (!allSections().some(s => s.id === target)) return;
      setActiveFallback(target);
      setCompactMenuOpen(false);
      navigate({ pathname: '/settings', hash: target }, { replace: true });
    },
    [navigate],
  );

  const sections = allSections().filter(section => !singleUser || section.id !== 'sharing');
  const activeLabel = sections.find(section => section.id === active)?.label;

  return (
    /* The settings pane can be narrow even on a desktop viewport when the
      assistant is open, so its menu layout is selected by container width. */
    <PageShell>
      <div className="settings-layout-container">
        <PageSection innerClassName="settings-layout">
          {/* Section nav */}
          <aside className="settings-sidebar">
            <Text as="h1" variant="heading-md" weight="semibold" className="mb-5">Settings</Text>
            <SettingsNavigation sections={sections} active={active} query={query} onQuery={setQuery} onSelect={navigateToSection} />
          </aside>

          <div ref={compactRef} className="settings-compact-menu">
            <button ref={triggerRef} type="button" aria-label={`Settings menu. Current section: ${activeLabel}`} aria-expanded={compactMenuOpen}
              aria-controls={compactMenuOpen ? 'settings-compact-nav' : undefined} onClick={() => setCompactMenuOpen(open => !open)}
              className="inline-flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-input)] border border-[var(--panel-border)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]">
              <SettingsIcon size={16} strokeWidth={1.75} aria-hidden />
              <Text as="span" variant="body-sm">Settings · {activeLabel}</Text>
              <ChevronDown size={14} aria-hidden className={`ml-auto transition-transform ${compactMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {compactMenuOpen && <div id="settings-compact-nav" className="settings-compact-nav">
              <SettingsNavigation sections={sections} active={active} query={query} onQuery={setQuery} onSelect={id => { navigateToSection(id); triggerRef.current?.focus(); }} />
            </div>}
          </div>

          {/* Section content */}
          <div className="min-w-0 flex-1" aria-label={activeLabel} role="region">
            <Suspense fallback={<SectionFallback />}>
              {sections.find(s => s.id === active)?.render({
                settings,
                update,
                navigateToSection,
              })}
            </Suspense>
          </div>
        </PageSection>
      </div>
    </PageShell>
  );
}
