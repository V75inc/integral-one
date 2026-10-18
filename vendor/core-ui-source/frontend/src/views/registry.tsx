import { Suspense, useMemo } from 'react';
import type {
  WidgetCapabilityDescriptor,
  WidgetRegistration,
  ViewWidgetProps,
} from './types';
import type { SavedView } from '../types';
import { MissingWidget } from './MissingWidget';

const registry = new Map<string, WidgetRegistration>();
const BASELINE_VIEW_TYPES = new Set(['feed']);

export function registerWidget(reg: WidgetRegistration) {
  registry.set(reg.type, reg);
}

export function getWidget(type: string): WidgetRegistration | undefined {
  return registry.get(type);
}

export function listWidgets(): WidgetRegistration[] {
  return Array.from(registry.values());
}

export function getEnabledWidgetTypes(views: SavedView[]): Set<string> {
  const enabled = new Set<string>(BASELINE_VIEW_TYPES);
  for (const view of views) {
    const viewType = String(view.type || '').trim().toLowerCase();
    if (viewType) enabled.add(viewType);
  }
  return enabled;
}

export function getEnabledWidgetRegistrations(views: SavedView[]): WidgetRegistration[] {
  const enabled = getEnabledWidgetTypes(views);
  return listWidgets().filter(reg => enabled.has(String(reg.type || '').toLowerCase()));
}

export function listWidgetCapabilities(): WidgetCapabilityDescriptor[] {
  return listWidgets().map(reg => ({
    capability: reg.type,
    label: reg.meta.label,
    description: reg.meta.description,
  }));
}

interface ViewRendererProps extends Omit<ViewWidgetProps, 'view'> {
  view: SavedView;
}

export function ViewRenderer({ view, ...rest }: ViewRendererProps) {
  let reg = getWidget(view.type);
  let resolvedView: SavedView = view;
  if (!reg) {
    const compositeMeta = (
      (view as SavedView & {
        composite?: { base?: string; config?: Record<string, unknown> };
      }).composite
    );
    const baseType = compositeMeta?.base;
    if (baseType) {
      const baseReg = getWidget(baseType);
      if (baseReg) {
        reg = baseReg;
        resolvedView = {
          ...view,
          type: baseType,
          config: {
            ...(view.config || {}),
            ...(compositeMeta?.config || {}),
          },
        };
      }
    }
  }
  if (!reg) {
    return <MissingWidget view={view} />;
  }
  const Component = reg.component;
  return (
    <Suspense
      fallback={
        <div
          className="min-h-24"
          role="status"
          aria-label="Loading view"
        />
      }
    >
      <Component view={resolvedView} {...rest} />
    </Suspense>
  );
}

interface ViewSelectorProps {
  views: SavedView[];
  activeViewId: string;
  onSelect: (view: SavedView) => void;
}

export function ViewSelector({ views, activeViewId, onSelect }: ViewSelectorProps) {
  const deduped = useMemo(() => {
    const byType = new Map<string, SavedView>();
    for (const view of views) {
      const existing = byType.get(view.type);
      if (!existing) {
        byType.set(view.type, view);
      } else if (view.is_default && !existing.is_default) {
        byType.set(view.type, view);
      } else if (view.is_default === existing.is_default && view.name && !existing.name) {
        byType.set(view.type, view);
      }
    }
    return Array.from(byType.values());
  }, [views]);

  if (!views.length) return null;

  return (
    <div className="min-w-0">
      <p className="text-[13px] uppercase tracking-[0.16em] text-[var(--text-subtle)] font-medium mb-3">
        Views
      </p>
      <div className="grid gap-1.5">
        {deduped.map(view => {
          const reg = getWidget(view.type);
          const Icon = reg?.meta.icon;
          const label = view.name || reg?.meta.label || view.type;
          const isActive = view.id === activeViewId;

          return (
            <button
              key={view.id}
              type="button"
              onClick={() => onSelect(view)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)] border border-[var(--panel-border)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] border border-transparent'
              }`}
            >
              {Icon && <Icon size={14} strokeWidth={1.5} />}
              <span className="truncate">{label}</span>
              {view.is_default && (
                <span className="ml-auto text-[12px] uppercase tracking-wide text-[var(--text-muted)] opacity-60">
                  default
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
