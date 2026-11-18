/** Shared App composition. Domain copy, reads, calculations and writes stay in Apps. */
import {useId} from 'react';
import type {AppActionsProps, AppFieldProps, AppGridProps, AppHeaderProps, AppNoticeProps, AppPageProps, AppSectionProps, AppSummaryProps} from '@integral/sdk-react';
import {Text} from './Text';
import {Surface} from './Surface';
import {Stack} from './Stack';
import {Inline} from './Inline';

export function AppPage({children, className, ...rest}: AppPageProps) {
  return <div {...rest} className={['min-w-0 w-full', className].filter(Boolean).join(' ')}><Stack gap="2xl">{children}</Stack></div>;
}
export function AppHeader({title, description, eyebrow, meta, actions}: AppHeaderProps) {
  return <header><Inline justify="between" align="start" gap="lg" wrap><Stack gap="sm" className="min-w-0 flex-1">
    {eyebrow ? <Text as="div" variant="meta">{eyebrow}</Text> : null}
    <Text as="h2" variant="heading-lg">{title}</Text>
    {description ? <Text as="p" variant="subtitle" tone="muted">{description}</Text> : null}
  </Stack>{meta ? <Text as="div" variant="meta">{meta}</Text> : null}{actions ? <AppActions>{actions}</AppActions> : null}</Inline></header>;
}
export function AppSection({title, description, actions, children, variant = 'panel', className}: AppSectionProps) {
  return <Surface as="section" tone={variant === 'plain' ? 'transparent' : 'panel'} border={variant === 'plain' ? 'none' : 'default'} padding={variant === 'plain' ? 'none' : 'lg'} className={className}>
    <Stack gap="xl">{title || description || actions ? <Inline justify="between" align="start" wrap><Stack gap="xs">
      {title ? <Text as="h3" variant="heading-sm">{title}</Text> : null}
      {description ? <Text as="p" variant="body-sm" tone="muted">{description}</Text> : null}
    </Stack>{actions ? <AppActions>{actions}</AppActions> : null}</Inline> : null}{children}</Stack>
  </Surface>;
}
const columns = {1: 'grid-cols-1', 2: 'grid-cols-1 md:grid-cols-2', 3: 'grid-cols-1 md:grid-cols-3', 4: 'grid-cols-[repeat(auto-fit,minmax(max(11rem,calc(25%_-_1rem)),1fr))]'};
// fit="container": columns follow the room the grid has (a page beside the assistant is narrower than the window), not the window width.
// Each column is at least a readable width and at least its share of the row, so the row fills and wraps cleanly.
const containerColumns = {1: 'grid-cols-1', 2: 'grid-cols-[repeat(auto-fit,minmax(max(20rem,calc(50%_-_1rem)),1fr))]', 3: 'grid-cols-[repeat(auto-fit,minmax(max(14rem,calc(33.333%_-_1rem)),1fr))]', 4: 'grid-cols-[repeat(auto-fit,minmax(max(11rem,calc(25%_-_1rem)),1fr))]'};
const gaps = {none: 'gap-0', xs: 'gap-1', sm: 'gap-2', md: 'gap-3', lg: 'gap-4', xl: 'gap-5', '2xl': 'gap-6'};
export function AppGrid({children, columns: count = 2, gap = 'lg', fit, className, ...rest}: AppGridProps) {
  return <div {...rest} className={['grid min-w-0 items-start', (fit === 'container' ? containerColumns : columns)[count], gaps[gap], className].filter(Boolean).join(' ')}>{children}</div>;
}
export function AppField({id, fieldKey, label, required, help, error, children}: AppFieldProps) {
  const generated = useId();
  const controlId = id || `app-field-${generated}`;
  const describedBy = [help ? `${controlId}-help` : '', error ? `${controlId}-error` : ''].filter(Boolean).join(' ') || undefined;
  return <div className="min-w-0" data-field-key={fieldKey}><Stack gap="sm">
    <Text as="label" htmlFor={controlId} variant="label">{label}{required ? <span aria-hidden="true"> *</span> : null}</Text>
    {children({id: controlId, required, invalid: Boolean(error), 'aria-invalid': Boolean(error), 'aria-describedby': describedBy})}
    {help ? <Text as="p" variant="meta" id={`${controlId}-help`}>{help}</Text> : null}
    {error ? <Text as="p" variant="meta" tone="danger" role="alert" id={`${controlId}-error`}>{error}</Text> : null}
  </Stack></div>;
}
export function AppActions({children, align = 'end'}: AppActionsProps) {
  return <Inline gap="sm" justify={align === 'end' ? 'end' : align === 'between' ? 'between' : 'start'} wrap>{children}</Inline>;
}
export function AppSummary({title, rows, description}: AppSummaryProps) {
  return <Surface as="section" tone="panel-2" padding="lg"><Stack gap="lg"><Text as="h3" variant="heading-sm">{title}</Text>
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 tabular-nums">{rows.map(row => <SummaryRow key={row.key} row={row} />)}</dl>
    {description ? <Text as="p" variant="meta">{description}</Text> : null}
  </Stack></Surface>;
}
function SummaryRow({row}: {row: AppSummaryProps['rows'][number]}) {
  return <><Text as="dt" variant={row.emphasis ? 'heading-sm' : 'body-sm'} tone={row.emphasis ? 'default' : 'muted'}>{row.label}</Text><Text as="dd" variant={row.emphasis ? 'heading-md' : 'body-sm'} className="text-right">{row.value}</Text></>;
}
export function AppNotice({children, title, tone = 'info', action}: AppNoticeProps) {
  return <Surface tone="panel-2" padding="md" role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}><Stack gap="sm">
    {title ? <Text as="div" variant="label" tone={tone}>{title}</Text> : null}
    <Text as="div" variant="body-sm" tone={tone}>{children}</Text>
    {action ? <AppActions align="start">{action}</AppActions> : null}
  </Stack></Surface>;
}
