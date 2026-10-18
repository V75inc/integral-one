import type { ReactNode } from 'react';
import { Text } from '../../ui';

export function WidgetShell({
  title,
  children,
  variant = 'default',
}: {
  title: string;
  children: ReactNode;
  variant?: 'default' | 'chart';
}) {
  return (
    <div className="dashboard-widget flex h-full min-h-[88px] flex-col">
      {title ? (
        <div className="dashboard-widget__header">
          <Text variant="heading-sm" as="h3" className="truncate">
            {title}
          </Text>
        </div>
      ) : null}
      <div
        className={
          variant === 'chart'
            ? 'dashboard-widget__body dashboard-widget__body--chart flex flex-col'
            : 'dashboard-widget__body flex flex-col'
        }
      >
        {children}
      </div>
    </div>
  );
}
