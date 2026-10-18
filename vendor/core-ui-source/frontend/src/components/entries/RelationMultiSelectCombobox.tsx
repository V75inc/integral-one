import {
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  Search,
  X,
  Loader2,
} from 'lucide-react';
import type { OperationalModelFieldSpec } from '../../types';
import { Text, Surface } from '../../ui';
import {
  useRelationLabels,
  routeForRelationTarget,
  type RelationNavContext,
} from './relations';

export interface RelationMultiSelectOption {
  value: string;
  label: string;
}

function FallbackLabel({
  id,
  relation,
}: {
  id: string;
  relation: OperationalModelFieldSpec['relation'];
}) {
  const { targets } = useRelationLabels(id, relation);
  const label = targets[0]?.label;
  return <>{label ?? `Entry ${String(id).slice(-6)}`}</>;
}

export interface RelationMultiSelectComboboxProps {
  field: OperationalModelFieldSpec;
  value: unknown;
  onChange: (val: string[]) => void;
  options: RelationMultiSelectOption[];
  loading?: boolean;
  placeholder?: string;
  readonly?: boolean;
  disabled?: boolean;
  emptyHint?: string;
  onNavigate?: () => void;
  navContext?: RelationNavContext | null;
}

export function RelationMultiSelectCombobox({
  field,
  value,
  onChange,
  options,
  loading = false,
  placeholder,
  readonly = false,
  disabled = false,
  emptyHint,
  onNavigate,
  navContext,
}: RelationMultiSelectComboboxProps) {
  const selected = useMemo<string[]>(() => {
    if (Array.isArray(value)) {
      return value
        .map(v => {
          if (typeof v === 'string') return v.trim();
          if (typeof v === 'object' && v !== null && 'id' in v) {
            return String((v as { id?: unknown }).id || '').trim();
          }
          return String(v || '').trim();
        })
        .filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
      return [value.trim()];
    }
    if (typeof value === 'object' && value !== null && 'id' in value) {
      const rawId = String((value as { id?: unknown }).id || '').trim();
      if (rawId) return [rawId];
    }
    return [];
  }, [value]);

  const { targets } = useRelationLabels(selected, field.relation);

  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const updatePlacement = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < 240 && spaceAbove > spaceBelow) {
      setPlacement('top');
    } else {
      setPlacement('bottom');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePlacement();
      window.addEventListener('resize', updatePlacement);
      window.addEventListener('scroll', updatePlacement, true);
      return () => {
        window.removeEventListener('resize', updatePlacement);
        window.removeEventListener('scroll', updatePlacement, true);
      };
    }
  }, [isOpen, updatePlacement]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && options.length > 5) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, options.length]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter(opt => opt.label.toLowerCase().includes(q));
  }, [options, searchQuery]);

  const toggleOption = useCallback(
    (id: string) => {
      if (readonly || disabled) return;
      if (selected.includes(id)) {
        onChange(selected.filter(x => x !== id));
      } else {
        onChange([...selected, id]);
      }
    },
    [selected, onChange, readonly, disabled]
  );

  const removeOption = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (readonly || disabled) return;
      onChange(selected.filter(x => x !== id));
    },
    [selected, onChange, readonly, disabled]
  );

  const selectAllFiltered = useCallback(() => {
    if (readonly || disabled) return;
    const newSelected = new Set(selected);
    for (const opt of filteredOptions) {
      newSelected.add(opt.value);
    }
    onChange(Array.from(newSelected));
  }, [filteredOptions, selected, onChange, readonly, disabled]);

  const clearAll = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (readonly || disabled) return;
      onChange([]);
    },
    [onChange, readonly, disabled]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && isOpen) {
      setIsOpen(false);
      e.stopPropagation();
    }
  };

  const isInteractive = !readonly && !disabled;
  const effectivePlaceholder =
    placeholder ||
    (field.key === 'tasks'
      ? options.length === 0
        ? 'Select project(s) above first'
        : 'Select tasks…'
      : `Select ${field.name || 'options'}…`);

  return (
    <div
      ref={containerRef}
      className="relative w-full text-left"
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Control */}
      <Surface tone="panel" border="default" radius="input" className="w-full">
        <div
          role={isInteractive ? 'combobox' : undefined}
          aria-label={field.name || 'Related entries'}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          tabIndex={isInteractive ? 0 : undefined}
          onClick={() => {
            if (isInteractive) {
              setIsOpen(prev => !prev);
            }
          }}
          className={[
            'group flex min-h-[38px] w-full items-center justify-between gap-1.5 px-2.5 py-1.5 transition-colors',
            isInteractive
              ? 'cursor-pointer hover:border-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-accent)]'
              : 'cursor-default opacity-85',
            isOpen ? 'ring-1 ring-[var(--brand-accent)] rounded-[var(--radius-input)]' : '',
          ].join(' ')}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1.5 min-w-0">
            {selected.length === 0 ? (
              <Text variant="body-sm" tone="muted" className="select-none">
                {effectivePlaceholder}
              </Text>
            ) : (
              selected.map(id => {
                const choice = options.find(o => o.value === id);
                const target = targets.find(t => t.id === id);
                const displayLabel = choice?.label || target?.label || 'Linked record';
                const route = target ? routeForRelationTarget(target, navContext) : null;

                return (
                  <Surface
                    key={id}
                    tone="panel-2"
                    border="subtle"
                    radius="input"
                    className="inline-flex items-center gap-1 max-w-full px-2 py-0.5"
                  >
                    {route ? (
                      <Link
                        to={route}
                        title={`View ${displayLabel}`}
                        className="truncate max-w-[200px] text-[var(--link)] hover:text-[var(--link-hover)] hover:underline cursor-pointer select-none"
                        onClick={e => {
                          e.stopPropagation();
                          onNavigate?.();
                        }}
                      >
                        <Text variant="body-sm" className="truncate text-inherit">
                          {displayLabel}
                        </Text>
                      </Link>
                    ) : (
                      <Text variant="body-sm" tone="default" className="truncate max-w-[220px]">
                        {choice?.label || (
                          <FallbackLabel id={id} relation={field.relation} />
                        )}
                      </Text>
                    )}
                    {isInteractive && (
                      <button
                        type="button"
                        className="ml-0.5 rounded p-0.5 opacity-60 hover:opacity-100 hover:text-[var(--danger-fg)]"
                        aria-label={`Remove ${displayLabel}`}
                        onClick={e => removeOption(id, e)}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </Surface>
                );
              })
            )}
          </div>

          {/* Right action icons */}
          <div className="flex items-center gap-1 shrink-0 ml-1 opacity-70">
            {loading && <Loader2 size={14} className="animate-spin text-[var(--brand-accent)]" />}
            {isInteractive && selected.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="p-1 rounded opacity-60 hover:opacity-100 hover:text-[var(--danger-fg)]"
                title="Clear all selections"
                aria-label="Clear all selections"
              >
                <X size={14} />
              </button>
            )}
            {isInteractive && (
              <ChevronDown
                size={15}
                className={`transition-transform duration-200 ${isOpen ? 'rotate-180 text-[var(--brand-accent)]' : ''}`}
              />
            )}
          </div>
        </div>
      </Surface>

      {/* Dropdown Popover */}
      {isOpen && isInteractive && (
        <Surface
          tone="panel"
          border="default"
          elevation="card"
          radius="input"
          className={[
            'absolute z-50 w-full min-w-[280px] max-h-[260px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100',
            placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          ].join(' ')}
        >
          {/* Search box if options > 5 */}
          {options.length > 5 && (
            <Surface tone="panel-2" border="none" className="p-2 border-b border-[var(--panel-border)] bg-opacity-60 shrink-0">
              <div className="relative flex items-center">
                <Search size={14} className="absolute left-2.5 opacity-60" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={`Filter ${field.name.toLowerCase()}…`}
                  className="w-full rounded-md border border-[var(--panel-border)] bg-transparent pl-9 pr-7 py-1.5 text-xs focus:outline-none focus:border-[var(--brand-accent)] focus:ring-1 focus:ring-[var(--brand-accent)]"
                  onClick={e => e.stopPropagation()}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 p-0.5 opacity-60 hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </Surface>
          )}

          {/* Quick Actions Header */}
          {options.length > 0 && (
            <Surface tone="panel-2" border="none" className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)] shrink-0">
              <Text variant="meta" tone="muted">
                {selected.length} of {options.length} selected
              </Text>
              <div className="flex items-center gap-2">
                {filteredOptions.length > 0 && (
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="text-xs text-[var(--brand-accent)] hover:underline font-medium"
                  >
                    Select all
                  </button>
                )}
                {selected.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="text-xs opacity-70 hover:opacity-100 hover:text-[var(--danger-fg)]"
                  >
                    Clear
                  </button>
                )}
              </div>
            </Surface>
          )}

          {/* List Options */}
          <div className="flex-1 min-h-0 overflow-y-auto p-1 divide-y divide-[var(--border-subtle)]/40">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs opacity-70">
                <Loader2 size={16} className="animate-spin text-[var(--brand-accent)]" />
                <Text variant="body-sm" tone="muted">Loading choices…</Text>
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs px-4">
                <Text variant="body-sm" tone="muted">
                  {searchQuery
                    ? `No options match "${searchQuery}"`
                    : emptyHint ||
                      (field.key === 'tasks'
                        ? 'Select project(s) above first to load tasks.'
                        : 'No options available.')}
                </Text>
              </div>
            ) : (
              filteredOptions.map(opt => {
                const isChecked = selected.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={[
                      'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors',
                      isChecked
                        ? 'font-medium opacity-100'
                        : 'opacity-80 hover:opacity-100',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOption(opt.value)}
                      className="rounded border-[var(--panel-border)] text-[var(--brand-accent)] focus:ring-[var(--brand-accent)] h-3.5 w-3.5 accent-[var(--brand-accent)]"
                    />
                    <Text variant="body-sm" tone={isChecked ? 'default' : 'muted'} className="flex-1 min-w-0 truncate">
                      {opt.label}
                    </Text>
                    {isChecked && (
                      <Check size={13} className="shrink-0 text-[var(--brand-accent)]" />
                    )}
                  </label>
                );
              })
            )}
          </div>

          {/* Footer with Done button */}
          <Surface tone="panel-2" border="none" className="p-2 border-t border-[var(--panel-border)] flex items-center justify-end shrink-0">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded px-2.5 py-1 text-xs font-medium bg-[var(--brand-accent)] text-white hover:opacity-90"
            >
              Done
            </button>
          </Surface>
        </Surface>
      )}
    </div>
  );
}
