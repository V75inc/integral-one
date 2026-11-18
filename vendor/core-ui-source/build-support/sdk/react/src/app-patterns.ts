import type {HTMLAttributes, ReactNode} from 'react';

/** Presentation contracts; these components never load or save business data. */
export type AppGap = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type AppPageProps = HTMLAttributes<HTMLDivElement> & {children: ReactNode};
export type AppHeaderProps = {title: ReactNode; description?: ReactNode; eyebrow?: ReactNode; meta?: ReactNode; actions?: ReactNode};
export type AppSectionProps = {title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; variant?: 'panel' | 'plain'; className?: string};
export type AppGridProps = AppPageProps & {columns?: 1 | 2 | 3 | 4; gap?: AppGap; fit?: 'container'};
export type AppFieldBinding = {id: string; required?: boolean; invalid: boolean; 'aria-invalid': boolean; 'aria-describedby'?: string};
export type AppFieldProps = {id?: string; fieldKey?: string; label: ReactNode; required?: boolean; help?: ReactNode; error?: string; children: (binding: AppFieldBinding) => ReactNode};
export type AppActionsProps = {children: ReactNode; align?: 'start' | 'end' | 'between'};
export type AppSummaryProps = {title: ReactNode; rows: {key: string; label: ReactNode; value: ReactNode; emphasis?: boolean}[]; description?: ReactNode};
export type AppNoticeProps = {children: ReactNode; title?: ReactNode; tone?: 'info' | 'success' | 'warn' | 'danger'; action?: ReactNode};
