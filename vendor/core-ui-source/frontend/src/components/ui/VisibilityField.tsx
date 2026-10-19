import { Lock, Users, Globe } from 'lucide-react';
import { LINE_ICON_STROKE } from './IconWell';

export type VisibilityChoice = 'inherit' | 'private' | 'workspace' | 'public';

type Props = {
  value: VisibilityChoice;
  onChange: (v: VisibilityChoice) => void;
  /** When false, the "Workspace" choice is disabled (no workspace context). */
  workspaceAvailable: boolean;
  /** Shown under the group when value is inherit */
  inheritHint: string;

  disabled?: boolean;
};

const BTN =
  'flex h-full flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-all min-w-0';
const BTN_ON =
  'border-[var(--cta-bg)] bg-[var(--cta-bg)]/12 ring-1 ring-[var(--cta-bg)]/35';
const BTN_OFF =
  'border-[var(--panel-border)] bg-[var(--panel-2)]/30 hover:border-[var(--text-muted)]/30';

export function VisibilityField({
  value,
  onChange,
  workspaceAvailable,
  inheritHint,
  disabled,
}: Props) {
  const items: {
    key: VisibilityChoice;
    label: string;
    Icon: typeof Lock;
    sub: string;
    disabled?: boolean;
  }[] = [
    {
      key: 'private',
      label: 'Private',
      Icon: Lock,
      sub: 'Only you, unless you add others',
    },
    {
      key: 'workspace',
      label: 'Workspace',
      Icon: Users,
      sub: workspaceAvailable
        ? 'Every workspace member can view'
        : 'No workspace active',
      disabled: !workspaceAvailable,
    },
    {
      key: 'public',
      label: 'Public',
      Icon: Globe,
      sub: 'Anyone can view; editing still requires permission',
    },
  ];

  return (
    <div className="space-y-2">
      <div
        className="grid gap-2 auto-rows-fr grid-cols-3"
      >
        {items.map(({ key, label, Icon, sub, disabled: itemDis }) => {
          const on = value === key;
          const dim = disabled || itemDis;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              disabled={dim}
              onClick={() => !dim && onChange(key)}
              className={`${BTN} ${on ? BTN_ON : BTN_OFF} ${
                dim ? 'opacity-45 cursor-not-allowed' : ''
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
                <Icon size={14} strokeWidth={LINE_ICON_STROKE} className="shrink-0 opacity-80" />
                {label}
              </span>
              <span className="text-[12px] leading-snug text-[var(--text-muted)] line-clamp-2">
                {sub}
              </span>
            </button>
          );
        })}
      </div>
      {value === 'inherit' ? (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">{inheritHint}</p>
      ) : null}
    </div>
  );
}
