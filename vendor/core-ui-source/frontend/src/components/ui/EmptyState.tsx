interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /**
   * `dense` trims the vertical padding and copy width for narrow hosts —
   * the entry dialog's ~360px companion column, where the default `py-16`
   * plus a 48px IconWell eats the whole panel before any content shows.
   * Same anatomy (icon / title / description / action), less air.
   */
  size?: 'default' | 'dense';
  /** Use a defined card when the surrounding page uses a gray canvas. */
  surface?: 'plain' | 'card';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'default',
  surface = 'plain',
}: EmptyStateProps) {
  const dense = size === 'dense';
  const content = (
    <div
      className={`flex flex-col items-center justify-center px-4 text-center ${dense ? 'py-8' : 'py-16'}`}
    >
      {icon != null && (
        <div className={`flex justify-center ${dense ? 'mb-2.5' : 'mb-4'}`}>{icon}</div>
      )}
      <h3
        className={`font-semibold text-[var(--text)] mb-1 ${dense ? 'text-sm' : 'text-lg'}`}
      >
        {title}
      </h3>
      {description && (
        <p
          className={`text-[var(--text-muted)] ${dense ? 'text-xs max-w-[15rem] mb-3' : 'text-sm max-w-sm mb-5'}`}
        >
          {description}
        </p>
      )}
      {action}
    </div>
  );

  return surface === 'card' ? <Surface tone="panel-2">{content}</Surface> : content;
}
import { Surface } from '../../ui';
