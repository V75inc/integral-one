/** Public React authoring contract. No imports from Core's private modules. */
import type {AppActionsProps, AppFieldProps, AppGridProps, AppHeaderProps, AppNoticeProps, AppPageProps, AppSectionProps, AppSummaryProps} from './app-patterns';
export type * from './app-patterns';
import { forwardRef, createContext, useContext, useEffect, useRef, useState, type ComponentType, type ReactNode, type ComponentProps, type ElementType, type HTMLAttributes } from 'react';

export const SDK_VERSION = '1.2.0';
export class AppUIError extends Error {
  constructor(message: string, readonly outcome: 'rejected' | 'unconfirmed' | 'withheld' = 'rejected', readonly operationReceipt?: unknown) { super(message); this.name = 'AppUIError'; }
}
export type Placement = 'home' | 'track' | 'entry_compose' | 'entry_detail';
export type Json = Record<string, unknown>;
export interface ComponentDeclaration {
  key: string; entry: string; digest: string; export_name: string; sdk_range: '^1.0.0' | '^1.1.0' | '^1.2.0';
  placements: Placement[]; props_schema: Json;
}
export type OperationResult = { output: Json; operation_receipt?: unknown; current_state_verified?: false };
export type LifecycleResult = { ok: boolean; error?: string; field_errors?: Record<string, string>; value?: unknown; outcomeRecorded?: boolean };
export type EntryFieldMetadata = {key: string; name: string; type: string; required?: boolean; readonly?: boolean; enum?: string[]; placeholder?: string; help?: string; hide_on_create?: boolean};
export type AppReadOptions = {staleTime?: number};
export type AppQueryOptions = AppReadOptions & {enabled?: boolean};
export type LookupOption = {id: string; label: string; description?: string; disabled?: boolean; [key: string]: unknown};
export type LookupPage = {items: LookupOption[]; next_cursor?: string | null};
export type AsyncComboboxProps = {id?: string; required?: boolean; 'aria-describedby'?: string; label: string; value: string; selectedLabel?: string; loadPage: (query: string, cursor: string | null, signal: AbortSignal) => Promise<LookupPage>; onChange: (option: LookupOption) => void; disabled?: boolean; placeholder?: string; invalid?: boolean; onCreate?: () => void; createLabel?: string};
export type DataTableColumn<Row = Json> = {key: string; label: ReactNode; align?: 'start' | 'end'; sortable?: boolean; sortValue?: (row: Row) => string | number | null | undefined; pinned?: boolean | 'start' | 'end'; width?: string; group?: string; emphasis?: 'link'; render?: (row: Row) => ReactNode; total?: ReactNode | ((rows: Row[]) => ReactNode)};
export type DataTableProps<Row = Json> = {columns: DataTableColumn<Row>[]; rows: Row[]; rowKey: (row: Row) => string; caption: string; groups?: {key: string; label: string}[]; defaultSort?: {key: string; direction: 'asc' | 'desc'} | null; pageSize?: number; onRowClick?: (row: Row) => void; empty?: ReactNode; maxHeight?: string; density?: 'comfortable' | 'compact'; rowTone?: (row: Row) => 'danger' | 'warn' | undefined; sectionBy?: (row: Row) => string | undefined; sectionTotals?: boolean; columnPicker?: {presets?: {label: string; keys: string[]}[]; persistKey?: string}; pinnable?: boolean; toolbar?: ReactNode; minWidth?: string};
export type LineChartProps = {labels: string[]; series: {key: string; label: string; values: number[]}[]; tooltips?: string[]; ariaLabel: string; formatValue?: (value: number) => string};
export type BridgeChartProps = {steps: {key: string; label: string; value: number}[]; ariaLabel: string; formatValue?: (value: number) => string; upLabel?: string; downLabel?: string};
export type ProgressProps = {value?: number; ariaLabel: string};
export type StatProps = {label: ReactNode; value: ReactNode; note?: ReactNode; delta?: ReactNode; emphasis?: boolean; trend?: number[]; trendLabel?: string};
export type TabsProps = {options: {value: string; label: ReactNode; count?: number | null}[]; value: string; onChange: (value: string) => void; ariaLabel?: string};
export type BadgeProps = {tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'info'; children: ReactNode};
export type FilePreviewProps = {title: string; data?: string; url?: string; mime?: string; filename?: string; height?: string; emptyTitle?: ReactNode; emptyMessage?: ReactNode};
export type DateInputProps = {required?: boolean; invalid?: boolean; 'aria-describedby'?: string; value: string; onChange: (value: string) => void; mode?: 'date' | 'datetime'; disabled?: boolean; placeholder?: string; 'aria-label'?: string; id?: string};
export interface ContributionLifecycle {
  mode: 'create' | 'edit' | 'detail';
  entryId?: string; trackId?: string; related?: unknown; customFields: Json; fields?: EntryFieldMetadata[]; fieldErrors?: Record<string, string>;
  onDraftPatch?: (patch: {custom_fields?: Json; related?: unknown}) => void;
  register: (handle: {requestValidate: () => Promise<LifecycleResult>; requestSubmit: (entryId?: string | null) => Promise<LifecycleResult>}) => () => void;
}
export interface AppUI {
  principalId: string; workspaceId: string; appId: string; componentKey: string;
  placement: Placement; preview: boolean; context: Json;
  lifecycle?: ContributionLifecycle;
  subscribe?: (listener: () => void) => () => void;
  query: (key: string, input?: Json, signal?: AbortSignal, options?: AppReadOptions) => Promise<Json>;
  invoke: (key: string, input: Json) => Promise<OperationResult>;
  navigate: (target: {kind: 'app' | 'track' | 'entry' | 'dashboard'; id: string; source_entry_id?: string; field_key?: string}) => Promise<void>;
  notify: (message: string, kind?: 'success' | 'error' | 'info') => void;
  confirm: (options: {title: string; message: string; confirmLabel?: string; variant?: 'default' | 'danger'}) => Promise<boolean>;
}
const Context = createContext<AppUI | null>(null);
export const AppUIProvider = Context.Provider;
export function useOptionalAppUI() {return useContext(Context);}
export function useAppUI(): AppUI {
  const value = useContext(Context);
  if (!value) throw new Error('App UI must be mounted by Integral.');
  return value;
}
export function useContributionLifecycle() { return useAppUI().lifecycle; }
export function useEntryDraft() {
  const lifecycle = useContributionLifecycle();
  if (!lifecycle) throw new Error('This component requires an Entry draft.');
  return {values: lifecycle.customFields, related: lifecycle.related, fields: lifecycle.fields || [], errors: lifecycle.fieldErrors || {},
    mode: lifecycle.mode, entryId: lifecycle.entryId,
    patch: (values: Json) => {
      if (lifecycle.mode === 'detail' || !lifecycle.onDraftPatch) throw new Error('This Entry is read only.');
      lifecycle.onDraftPatch({custom_fields: values});
    },
    register: lifecycle.register};
}
export type AppQueryResult = {data?: Json; error?: Error; loading: boolean; refetch: () => void};
export function useAppQuery(key: string, input: Json = {}, options: AppQueryOptions = {}): AppQueryResult {
  const api = useAppUI();
  const signature = JSON.stringify([api.principalId, api.workspaceId, api.appId, api.componentKey, api.preview, key, input], (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
  const enabled = options.enabled !== false;
  const staleTime = options.staleTime ?? 30_000;
  const [revision, refresh] = useState(0);
  const [state, setState] = useState<{signature: string; source: AppUI['query']; data?: Json; error?: Error; loading: boolean}>({signature, source: api.query, loading: true});
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    // Keep what is on screen while the same query refreshes; only a different query starts empty.
    setState(previous => previous.signature === signature && previous.source === api.query ? {...previous, loading: true} : {signature, source: api.query, loading: true});
    api.query(key, input, controller.signal, {staleTime}).then(
      data => { if (!controller.signal.aborted) setState({signature, source: api.query, data, loading: false}); },
      error => { if (!controller.signal.aborted) setState({signature, source: api.query, error, loading: false}); },
    );
    return () => controller.abort();
    // Input changes are represented by the serialized contract; api also
    // changes on a new release, preview policy or committed scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.query, signature, revision, enabled, staleTime]);
  useEffect(() => enabled ? api.subscribe?.(() => refresh(value => value + 1)) : undefined, [api.subscribe, enabled]);
  const current = state.signature === signature && state.source === api.query ? state : {loading: enabled, data: undefined, error: undefined};
  return {data: current.data, error: current.error, loading: enabled && current.loading, refetch: () => refresh(value => value + 1)};
}
export function useAppOperation(key: string) {
  const api = useAppUI();
  const pending = useRef<{signature: string; task: Promise<OperationResult>} | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const run = (input: Json) => {
    const signature = JSON.stringify([api.principalId, api.workspaceId, api.appId, key, input]);
    if (pending.current) return pending.current.signature === signature ? pending.current.task : Promise.reject(new Error('Another submission is pending.'));
    setBusy(true);
    const task = api.invoke(key, input).finally(() => {
      if (pending.current?.task === task) pending.current = null;
      if (active.current) setBusy(false);
    });
    pending.current = {signature, task};
    return task;
  };
  return {run, busy};
}

/** Reuse the host Entry's typed fields or a saved native view on its own track. */
export type EntryRegionProps = {viewKey?: string; fields?: string[]; columns?: 1 | 2 | 3; className?: string};
export type ButtonProps = ComponentProps<'button'> & {variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'; size?: 'xs' | 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode};
export type InputProps = Omit<ComponentProps<'input'>, 'size'> & {size?: 'sm' | 'md' | 'lg'; invalid?: boolean};
export type SelectProps = Omit<ComponentProps<'select'>, 'size'> & {size?: 'sm' | 'md' | 'lg'; invalid?: boolean};
export type TextareaProps = ComponentProps<'textarea'> & {size?: 'sm' | 'md' | 'lg'; invalid?: boolean};
export type TextProps = HTMLAttributes<HTMLElement> & {as?: ElementType; variant?: 'display-lg' | 'display-md' | 'display-sm' | 'heading-lg' | 'heading-md' | 'heading-sm' | 'body-lg' | 'body' | 'body-sm' | 'subtitle' | 'meta' | 'mono' | 'label'; weight?: 'normal' | 'medium' | 'semibold' | 'bold'; align?: 'start' | 'center' | 'end'; numeric?: boolean; tone?: 'default' | 'muted' | 'subtle' | 'brand' | 'info' | 'success' | 'warn' | 'danger' | 'ai' | 'inherit'};
export type SurfaceProps = HTMLAttributes<HTMLDivElement> & {tone?: 'panel' | 'panel-2' | 'transparent'; border?: 'default' | 'subtle' | 'entry-table' | 'transparent' | 'none'; radius?: 'card' | 'input' | 'pill' | 'none'; as?: ElementType; elevation?: 'flat' | 'sm' | 'card' | 'pop'; padding?: 'none' | 'xs' | 'sm' | 'md' | 'lg'};
export type LayoutProps = HTMLAttributes<HTMLDivElement> & {gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'; align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline'; justify?: 'start' | 'center' | 'end' | 'between' | 'around'; wrap?: boolean};
export type ModalProps = {open: boolean; onClose: () => void; title?: ReactNode; children?: ReactNode; /** `form` (default) suits most dialogs, `confirm` a short question, `wide` a table or preview. Core sets the width and the padding. */ size?: 'confirm' | 'form' | 'wide'; /** @deprecated Ignored; use `size`. */ width?: string; variant?: 'default' | 'compact'};

/** Components are supplied by the host; these declarations are the public UI surface. */
export interface UIPrimitives {
  AppPage?: ComponentType<AppPageProps>;
  AppHeader?: ComponentType<AppHeaderProps>;
  AppSection?: ComponentType<AppSectionProps>;
  AppGrid?: ComponentType<AppGridProps>;
  AppField?: ComponentType<AppFieldProps>;
  AppActions?: ComponentType<AppActionsProps>;
  AppSummary?: ComponentType<AppSummaryProps>;
  AppNotice?: ComponentType<AppNoticeProps>;

  EntryRegion?: ComponentType<EntryRegionProps>;
  AsyncCombobox?: ComponentType<AsyncComboboxProps>;
  DataTable?: ComponentType<DataTableProps<any>>;
  Stat?: ComponentType<StatProps>;
  Progress?: ComponentType<ProgressProps>;
  LineChart?: ComponentType<LineChartProps>;
  BridgeChart?: ComponentType<BridgeChartProps>;
  Tabs?: ComponentType<TabsProps>;
  Badge?: ComponentType<BadgeProps>;
  DateInput?: ComponentType<DateInputProps>;
  FilePreview?: ComponentType<FilePreviewProps>;
  Button: ComponentType<any>; Input: ComponentType<any>; Select: ComponentType<any>;
  Textarea: ComponentType<any>; Text: ComponentType<any>; Surface: ComponentType<any>;
  Stack: ComponentType<any>; Inline: ComponentType<any>; Modal: ComponentType<any> & {Body: ComponentType<any>; Footer: ComponentType<any>};
}
const Primitives = createContext<UIPrimitives | null>(null);
export const UIPrimitivesProvider = Primitives.Provider;
function primitive<P extends object>(name: keyof UIPrimitives): ComponentType<P> {
  return function Primitive(props: P) {
    const controls = useContext(Primitives);
    if (!controls) throw new Error('Integral UI primitives are unavailable.');
    const Control = controls[name] as ComponentType<any> | undefined;
    if (!Control) throw new Error(`Integral control ${name} is unavailable.`);
    return <Control {...props} />;
  };
}
function refPrimitive<P extends object, E extends HTMLElement>(name: keyof UIPrimitives) {
  return forwardRef<E, P>(function Primitive(props, ref) {
    const controls = useContext(Primitives);
    if (!controls) throw new Error('Integral UI primitives are unavailable.');
    const Control = controls[name] as ComponentType<any> | undefined;
    if (!Control) throw new Error(`Integral control ${name} is unavailable.`);
    return <Control {...props} ref={ref} />;
  });
}
export const Button = refPrimitive<ButtonProps, HTMLButtonElement>('Button');
export const Input = refPrimitive<InputProps, HTMLInputElement>('Input');
export const Select = refPrimitive<SelectProps, HTMLSelectElement>('Select');
export const Textarea = refPrimitive<TextareaProps, HTMLTextAreaElement>('Textarea');
export const EntryRegion = primitive<EntryRegionProps>('EntryRegion');
export const AsyncCombobox = primitive<AsyncComboboxProps>('AsyncCombobox');
const DataTableBase = primitive<DataTableProps<any>>('DataTable');
export function DataTable<Row extends object = Json>(props: DataTableProps<Row>) { return <DataTableBase {...(props as DataTableProps<any>)} />; }
export const Stat = primitive<StatProps>('Stat');
export const Progress = primitive<ProgressProps>('Progress');
export const LineChart = primitive<LineChartProps>('LineChart');
export const BridgeChart = primitive<BridgeChartProps>('BridgeChart');
export const Tabs = primitive<TabsProps>('Tabs');
export const Badge = primitive<BadgeProps>('Badge');
export const DateInput = primitive<DateInputProps>('DateInput');
export const FilePreview = primitive<FilePreviewProps>('FilePreview');
export const Text = primitive<TextProps>('Text');
export const Surface = primitive<SurfaceProps>('Surface');
export const Stack = primitive<LayoutProps>('Stack');
export const Inline = primitive<LayoutProps>('Inline');
const ModalRoot = primitive<ModalProps>('Modal');
export const Modal = Object.assign(ModalRoot, {
  Body: function Body({children}: {children: ReactNode}) { const ui = useContext(Primitives)!; return <ui.Modal.Body>{children}</ui.Modal.Body>; },
  Footer: function Footer({children}: {children: ReactNode}) { const ui = useContext(Primitives)!; return <ui.Modal.Footer>{children}</ui.Modal.Footer>; },
});

export const AppPage = primitive<AppPageProps>('AppPage');
export const AppHeader = primitive<AppHeaderProps>('AppHeader');
export const AppSection = primitive<AppSectionProps>('AppSection');
export const AppGrid = primitive<AppGridProps>('AppGrid');
export const AppField = primitive<AppFieldProps>('AppField');
export const AppActions = primitive<AppActionsProps>('AppActions');
export const AppSummary = primitive<AppSummaryProps>('AppSummary');
export const AppNotice = primitive<AppNoticeProps>('AppNotice');

/** What a record page shows. Any App can fill it, so a payslip, an invoice or a contract use the same page. */
export type RecordViewData = {
  title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode;
  badges?: {label: ReactNode; tone?: BadgeProps['tone']}[];
  /** Headline figures, shown as tiles. */
  figures?: {label: ReactNode; value: ReactNode; note?: ReactNode; emphasis?: boolean}[];
  /** Labelled groups of facts, shown as summary panels. */
  panels?: {title: ReactNode; rows: {key?: string; label: ReactNode; value: ReactNode; emphasis?: boolean}[]}[];
  /** The record's document (a PDF, an image), shown in the page with download. */
  file?: {filename?: string; mime?: string; content_base64?: string; url?: string} | null;
  file_title?: string; file_description?: ReactNode;
  file_empty?: {title?: ReactNode; message?: ReactNode};
  /** Buttons that open related records. */
  links?: {label: ReactNode; kind?: 'entry' | 'track' | 'app' | 'dashboard'; id: string; variant?: 'primary' | 'outline' | 'ghost'}[];
};

const columnsFor = (count: number, most: 2 | 3 | 4): 1 | 2 | 3 | 4 => Math.max(1, Math.min(count, most)) as 1 | 2 | 3 | 4;

/** A record page: header with related-record buttons, headline figures, fact panels and the record's document. */
export function RecordView({record}: {record: RecordViewData}) {
  const ui = useAppUI();
  const figures = record.figures || [];
  const panels = record.panels || [];
  const file = record.file;
  return <AppPage>
    <AppHeader eyebrow={record.eyebrow} title={record.title} description={record.subtitle}
      meta={record.badges?.length ? <>{record.badges.map((b, i) => <Badge key={i} tone={b.tone}>{b.label}</Badge>)}</> : undefined}
      actions={record.links?.length ? <AppActions>{record.links.map((link, i) =>
        <Button key={i} variant={link.variant || 'outline'} onClick={() => { void ui.navigate({kind: link.kind || 'entry', id: link.id}); }}>{link.label}</Button>)}</AppActions> : undefined} />
    {figures.length ? <AppGrid columns={columnsFor(figures.length, 4)} gap="md" fit="container">
      {figures.map((f, i) => <Stat key={i} label={f.label} value={f.value} note={f.note} emphasis={f.emphasis} />)}
    </AppGrid> : null}
    {panels.length ? <AppGrid columns={columnsFor(panels.length, 2)} gap="lg" fit="container">
      {panels.map((panel, i) => <AppSummary key={i} title={panel.title} rows={panel.rows.map((r, j) => ({...r, key: r.key || String(j)}))} />)}
    </AppGrid> : null}
    {record.file_title ? <AppSection title={record.file_title} description={record.file_description}>
      <FilePreview title={record.file_title} data={file?.content_base64} url={file?.url} mime={file?.mime} filename={file?.filename}
        emptyTitle={record.file_empty?.title} emptyMessage={record.file_empty?.message} />
    </AppSection> : null}
  </AppPage>;
}

/** A record page whose content an App query supplies: ``query`` returns a RecordViewData (or ``{ok: false, reason}``). It is asked about this entry unless ``input`` says otherwise. */
export function QueryRecordView({query, input, loadingText = 'Loading…'}: {query: string; input?: Json; loadingText?: ReactNode}) {
  const ui = useAppUI();
  const lifecycle = useContributionLifecycle();
  const entryId = String(lifecycle?.entryId || ui.context.entryId || '');
  const result = useAppQuery(query, input ?? {entry_id: entryId}, {enabled: Boolean(input || entryId), staleTime: 0});
  const out = ((result.data as {output?: Json} | undefined)?.output ?? result.data ?? {}) as Json;
  if (result.loading) return <AppPage><AppNotice>{loadingText}</AppNotice></AppPage>;
  if (result.error || out.ok === false) {
    return <AppPage><AppNotice tone="danger" title="This could not be shown">{String(out.reason || result.error?.message || 'Try again.')}</AppNotice></AppPage>;
  }
  return <RecordView record={out as unknown as RecordViewData} />;
}

/** Semantic aliases inherit the live host theme; fonts and spacing use typed controls. */
export const appTheme = Object.freeze({
  canvas: 'var(--bg)', panel: 'var(--panel)', inset: 'var(--panel-2)',
  text: 'var(--text)', muted: 'var(--text-muted)', subtle: 'var(--text-subtle)',
  border: 'var(--panel-border)', subtleBorder: 'var(--border-subtle)',
  focus: 'var(--focus-ring-color)', brand: 'var(--brand-accent)',
  info: 'var(--info-fg)', infoBackground: 'var(--info-bg)',
  success: 'var(--success-fg)', successBackground: 'var(--success-bg)',
  warning: 'var(--warn-fg)', warningBackground: 'var(--warn-bg)',
  danger: 'var(--danger-fg)', dangerBackground: 'var(--danger-bg)',
  cardRadius: 'var(--radius-card)', inputRadius: 'var(--radius-input)', pillRadius: 'var(--radius-pill)',
  shadowSmall: 'var(--shadow-sm)', shadowCard: 'var(--shadow-card)', shadowOverlay: 'var(--shadow-pop)',
});

export const themeTokens = Object.freeze({...appTheme, background: 'var(--bg)', foreground: 'var(--text)', muted: 'var(--text-muted)', border: 'var(--border)', danger: 'var(--danger)'});
