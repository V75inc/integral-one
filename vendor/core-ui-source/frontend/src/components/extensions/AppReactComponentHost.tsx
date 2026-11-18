import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AppUIProvider, UIPrimitivesProvider, SDK_VERSION, type AppUI, type Placement } from '@integral/sdk-react';
import * as AppPatterns from '../../ui/AppPatterns';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useScope } from '../../context/ScopeContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { BridgeChart, DataTable, LineChart, Progress, Stat, Tabs, StatusBadge, Input, Select, Textarea, Text, Surface, Stack, Inline } from '../../ui';
import { Button, Skeleton } from '../ui';
import { Modal } from '../ui/Modal';
import {AsyncCombobox} from './AsyncCombobox';
import {FilePreview} from '../ui/FilePreview';
import {DatePicker} from '../ui/DatePicker';
import {prepareReadScope, readScopedAppQuery} from './scopedAppReads';
import {EntryRegionBridge, EntryRegionHostContext} from './EntryRegionBridge';
import {runContributionHandles} from './contributionHandles';
import type {ContributionLifecycleHandle} from '../entries/contributionLifecycle';
import type { ContributionLifecycleApi } from '../entries/contributionLifecycle';
import { CHANGE_EVENT_APPLIED } from '../../hooks/useChangeEventInvalidation';
import { loadReactArtifact } from './reactArtifactLoader';
import { AppUIError, invokeTrustedOperation } from './trustedOperations';
import { getHostSessionRecoveryGeneration, subscribeHostSessionRecovery } from '../../api/sessionConnection';
import { LocalWorkspaceReconnectingError } from '../../api/localSessionError';

type Descriptor = {enabled: boolean; artifact_url: string; component: {digest: string; export_name: string; sdk_range: string}; submittedProps: Record<string, unknown>; definition_revision?: string};
export function supportsSDKRange(range: string) {
  const requested = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);
  const [major, minor, patch] = SDK_VERSION.split('.').map(Number);
  return Boolean(requested && Number(requested[1]) === major && (minor > Number(requested[2]) || (minor === Number(requested[2]) && patch >= Number(requested[3]))));
}
function DateInput(props: import('@integral/sdk-react').DateInputProps) {return <DatePicker {...props} mode={props.mode || 'date'} variant="field" />;}
/** The dialog Apps get: Core's own width tokens by name and Core's standard body padding, so an App never sizes or pads a dialog itself. */
const APP_DIALOG_WIDTH = {confirm: 'max-w-dialog-confirm', form: 'max-w-dialog-form', wide: 'max-w-dialog-wide'} as const;
function AppModalBase({size, width: _ignored, children, ...rest}: {size?: keyof typeof APP_DIALOG_WIDTH; width?: string; children?: ReactNode} & Record<string, unknown>) {
  return <Modal {...(rest as object)} open={Boolean(rest.open)} onClose={rest.onClose as () => void} width={APP_DIALOG_WIDTH[size || 'form']} variant={size === 'confirm' ? 'compact' : 'default'}><Modal.Body>{children}</Modal.Body></Modal>;
}

const AppModal = Object.assign(AppModalBase, {Body: Modal.Body, Footer: Modal.Footer});

class Boundary extends Component<{children: ReactNode; onError: () => void}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? <p role="alert">This App component could not be displayed. Reload the view to try again.</p> : this.props.children; }
}
export type AppReactComponentHostProps = {
  appId: string; componentKey: string; placement: Placement; props?: Record<string, unknown>;
  context?: Record<string, unknown>; lifecycle?: ContributionLifecycleApi;
  preview?: boolean; liveData?: boolean; fallback?: ReactNode;
  onFieldDataOwnerChange?: (owner: 'app' | 'host') => void;
};
export function AppReactComponentHost(props: AppReactComponentHostProps) {
  const {user} = useAuth();
  const {scope} = useScope();
  const principal = user?.user_id || user?.id || '';
  const workspace = scope?.workspaceId || '';
  return <Session key={JSON.stringify([principal, workspace, props.appId, props.componentKey, props.placement, props.context?.entryId, props.context?.trackId, props.lifecycle?.entryTypeKey])}
    {...props} principal={principal} workspace={workspace} />;
}
function Session({appId, componentKey, placement, props = {}, context = {}, lifecycle, preview = false, liveData = true, fallback, onFieldDataOwnerChange, principal, workspace}: AppReactComponentHostProps & {principal: string; workspace: string}) {
  const client = useQueryClient();
  const metadataMarked = useRef(false);
  useLayoutEffect(() => {
    if (metadataMarked.current || !lifecycle?.fields?.length) return;
    metadataMarked.current = true;
    performance.mark?.('integral:entry-ui-metadata-ready');
  }, [lifecycle?.fields]);
  useLayoutEffect(() => prepareReadScope(client, principal, workspace), [client, principal, workspace]);
  const subscribers = useRef(new Set<() => void>());
  const navigate = useNavigate();
  const {showToast} = useToast();
  const confirm = useConfirm();
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [Loaded, setLoaded] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const [failure, setFailure] = useState(false);
  const [loadedDigest, setLoadedDigest] = useState('');
  const [loadedRevision, setLoadedRevision] = useState('');
  const [busy, setBusy] = useState(0);
  const [reload, setReload] = useState(0);
  const [initialMode, setInitialMode] = useState<'native' | 'legacy' | null>(null);
  const recoveryGeneration = useSyncExternalStore(subscribeHostSessionRecovery, getHostSessionRecoveryGeneration);
  const propsSignature = JSON.stringify(props);
  const descriptorKey = ['app-ui-component', principal, workspace, appId, componentKey, placement, propsSignature, reload];
  const descriptor = useQuery<Descriptor>({
    queryKey: descriptorKey, retry: false, staleTime: 0,
    placeholderData: previous => previous,
    enabled: Boolean(principal && workspace),
    queryFn: async ({signal}) => {
      const generation = getHostSessionRecoveryGeneration();
      const submittedProps = JSON.parse(propsSignature) as Record<string, unknown>;
      let data: Descriptor;
      try {
        ({data} = await apiClient.post(`/extensions/${encodeURIComponent(appId)}/components/${encodeURIComponent(componentKey)}/mount`,
          {placement, props: submittedProps}, {signal, headers: {'X-Integral-Scope': `ws:${workspace}`}}));
      } catch (error) {
        if (error instanceof LocalWorkspaceReconnectingError) throw new LocalWorkspaceReconnectingError(generation);
        throw error;
      }
      return {...data, submittedProps};
    },
  });
  // The descriptor query may be shared by multiple mounts. Each observer must
  // independently latch its own initial mode from the admitted result.
  const observedMode = descriptor.data && !descriptor.isPlaceholderData ? (descriptor.data.enabled ? 'native' : 'legacy') : null;
  const mode = initialMode ?? observedMode;
  useLayoutEffect(() => {
    if (initialMode === null && observedMode) setInitialMode(observedMode);
  }, [initialMode, observedMode]);
  const interruptedByHost = descriptor.isError && descriptor.error instanceof LocalWorkspaceReconnectingError;
  useEffect(() => {
    if (descriptor.error instanceof LocalWorkspaceReconnectingError && descriptor.error.mountAttemptGeneration !== undefined
        && recoveryGeneration > descriptor.error.mountAttemptGeneration) void descriptor.refetch();
  }, [descriptor.error, recoveryGeneration, descriptor.refetch]);
  useEffect(() => {
    const prefix = ['app-ui-data', principal, workspace, appId, componentKey];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = (event: Event) => {
      const change = (event as CustomEvent).detail;
      const details = change?.details;
      if (details?.workspace_id && details.workspace_id !== workspace) return;
      if (details?.app_id && details.app_id !== appId) return;
      if (change?.scope?.startsWith('app:') && change.scope !== `app:${appId}`) return;
      if (change?.scope?.startsWith('ws:') && change.scope !== `ws:${workspace}`) return;
      if (/access|membership|exclu|collaborat|role|share|uninstall|pause/.test(change?.action || '')) {
        void client.cancelQueries({queryKey: prefix}); client.removeQueries({queryKey: prefix});
      } else void client.invalidateQueries({queryKey: prefix, refetchType: 'none'});
      clearTimeout(timer);
      timer = setTimeout(() => {
        void client.invalidateQueries({queryKey: ['app-ui-component', principal, workspace, appId, componentKey]});
        for (const listener of subscribers.current) listener();
      }, 100);
    };
    window.addEventListener(CHANGE_EVENT_APPLIED, changed);
    window.addEventListener('integral:ui-data-changed', changed);
    return () => {clearTimeout(timer); window.removeEventListener(CHANGE_EVENT_APPLIED, changed); window.removeEventListener('integral:ui-data-changed', changed);};
  }, [client, principal, workspace, appId, componentKey]);
  useLayoutEffect(() => {if (mode) onFieldDataOwnerChange?.(mode === 'legacy' ? 'host' : 'app');}, [mode, onFieldDataOwnerChange]);
  const declaration = descriptor.data;
  const releaseChanged = Boolean(loadedDigest && declaration && (loadedDigest !== declaration.component.digest || loadedRevision !== (declaration.definition_revision || '')));
  useLayoutEffect(() => {
    if (!releaseChanged) return;
    const prefix = ['app-ui-data', principal, workspace, appId, componentKey];
    void client.cancelQueries({queryKey: prefix}); client.removeQueries({queryKey: prefix});
  }, [releaseChanged, client, principal, workspace, appId, componentKey]);
  const channel = useMemo(() => ({active: false}), [reload, failure, declaration?.enabled, descriptor.isError, releaseChanged]);
  useLayoutEffect(() => {
    channel.active = Boolean(declaration?.enabled && !failure && !descriptor.isError && !releaseChanged);
    return () => {channel.active = false;};
  }, [channel, declaration?.enabled, failure, descriptor.isError, releaseChanged]);
  const effectiveProps = declaration?.submittedProps || props;
  useEffect(() => {
    if (mode === 'legacy' || !declaration?.enabled || !supportsSDKRange(declaration.component.sdk_range) || descriptor.isFetching || Loaded || failure) return;
    let active = true;
    loadReactArtifact(declaration.artifact_url).then(module => {
      if (!active) return;
      const component = module[declaration.component.export_name];
      const tag = (component as unknown as {$$typeof?: symbol})?.$$typeof;
      if (typeof component !== 'function' && ![Symbol.for('react.memo'), Symbol.for('react.forward_ref'), Symbol.for('react.lazy')].includes(tag!)) { setFailure(true); return; }
      setLoaded(() => component); setLoadedDigest(declaration.component.digest); setLoadedRevision(declaration.definition_revision || '');
    }, () => { if (active) setFailure(true); });
    return () => { active = false; };
  }, [mode, declaration, descriptor.isFetching, Loaded, failure]);
  // One registered handle per child; nested fields/lines must all validate and submit.
  const members = useRef(new Map<symbol, ContributionLifecycleHandle>());
  const registerMember = useCallback((handle: ContributionLifecycleHandle) => {
    const token = Symbol(); members.current.set(token, handle);
    return () => {members.current.delete(token);};
  }, []);
  const [relatedDraft, setRelatedDraft] = useState<unknown>();
  const composedLifecycle = useMemo(() => lifecycle ? {...lifecycle, related: relatedDraft, register: registerMember,
    onDraftPatch: (patch: {custom_fields?: Record<string, unknown>; related?: unknown}) => {
      if (patch.related !== undefined) setRelatedDraft(patch.related);
      lifecycle.onDraftPatch?.(patch);
    }} : undefined, [lifecycle, registerMember, relatedDraft]);
  const ready = Boolean(Loaded && declaration?.enabled && !failure && !descriptor.isError && !releaseChanged);
  const status = useRef(false);
  useLayoutEffect(() => {status.current = ready; return () => {status.current = false;};}, [ready]);
  const registerLifecycle = lifecycle?.register;
  useLayoutEffect(() => {
    // The disabled fallback owns its original lifecycle.
    if (mode === 'legacy' || (declaration && !declaration.enabled)) return;
    return registerLifecycle?.({
      requestValidate: async () => status.current && channel.active ? runContributionHandles(members.current.values(), 'validate', undefined, () => status.current && channel.active) : {ok: false, error: 'The App form is not ready.'},
      requestSubmit: async id => status.current && channel.active ? runContributionHandles(members.current.values(), 'submit', id, () => status.current && channel.active) : {ok: false, error: 'The App form is not ready.'},
    });
  }, [registerLifecycle, channel, mode, declaration?.enabled]);
  const latest = useRef({context, lifecycle, preview, liveData});
  useLayoutEffect(() => { latest.current = {context, lifecycle, preview, liveData}; }, [context, lifecycle, preview, liveData]);
  const api = useMemo<AppUI>(() => ({
    principalId: principal, workspaceId: workspace, appId, componentKey, placement, preview,
    context: {}, lifecycle: undefined,
    subscribe: listener => {subscribers.current.add(listener); return () => {subscribers.current.delete(listener);};},
    query: async (key, input = {}, signal, options) => {
      if (!mounted.current || !channel.active || signal?.aborted || (preview && !liveData) || (latest.current.preview && !latest.current.liveData)) throw new AppUIError('Live data is disabled.');
      const result = await readScopedAppQuery(client, [principal, workspace, appId, componentKey, loadedRevision, preview, liveData], key, input,
        async (payload, requestSignal) => (await apiClient.post(`/extensions/${encodeURIComponent(appId)}/queries/${encodeURIComponent(key)}`,
          {params: payload}, {signal: requestSignal, headers: {'X-Integral-Scope': `ws:${workspace}`}})).data, signal, options);
      if (!mounted.current || !channel.active || signal?.aborted) throw new AppUIError('This view is no longer active.');
      return result;
    },
    invoke: async (key, input) => {
      if (latest.current.preview || !mounted.current || !channel.active) throw new AppUIError('Business actions are disabled.');
      setBusy(value => value + 1);
      try {
        const result = await invokeTrustedOperation([principal, workspace, appId, componentKey], key, input,
          async (payload, intent) => (await apiClient.post(`/extensions/${encodeURIComponent(appId)}/operations/${encodeURIComponent(key)}`,
            {input: payload}, {headers: {'X-Integral-Scope': `ws:${workspace}`, 'X-Integral-Run-Origin': 'view', 'Idempotency-Key': intent}})).data,
          () => mounted.current && channel.active);
        void client.invalidateQueries({queryKey: ['app-ui-data', principal, workspace, appId]});
        window.dispatchEvent(new Event('integral:ui-data-changed'));
        return result;
      } finally { if (mounted.current) setBusy(value => value - 1); }
    },
    navigate: async target => {
      if (latest.current.preview || !mounted.current || !channel.active) throw new AppUIError('Navigation is disabled.');
      const result = (await apiClient.post(`/extensions/${encodeURIComponent(appId)}/navigate`, target, {headers: {'X-Integral-Scope': `ws:${workspace}`}})).data;
      if (mounted.current && channel.active) navigate(result.path);
    },
    notify: (message, kind = 'info') => { if (mounted.current && channel.active) showToast(message, kind); },
    confirm: async options => !latest.current.preview && mounted.current && channel.active && await confirm(options) && mounted.current && channel.active,
  }), [principal, workspace, appId, componentKey, placement, preview, liveData, channel, client, navigate, showToast, confirm, loadedRevision]);
  if ((descriptor.isError && (!Loaded || !interruptedByHost)) || failure || (declaration && !supportsSDKRange(declaration.component.sdk_range))) return <div role="alert"><Text>This App component is unavailable.</Text><Button type="button" disabled={busy > 0} onClick={async () => {
    if (!Loaded || await confirm({title: 'Reload App view?', message: 'Unsaved changes in this view will be discarded.', confirmLabel: 'Reload view'})) {
      setLoaded(null); setFailure(false); setReload(value => value + 1);
    }
  }}>Retry view</Button></div>;
  if (!declaration) return <Skeleton className="h-32" />;
  if (mode === 'legacy') return <>
    {declaration.enabled ? <div role="status"><Text>A newer view is available.</Text><Button type="button" onClick={async () => {
      if (await confirm({title: 'Reload App view?', message: 'Check any pending action first. Reloading discards unsaved changes.', confirmLabel: 'Reload view'})) {
        setInitialMode('native'); setReload(value => value + 1);
      }
    }}>Reload view</Button></div> : null}
    <div key="legacy-view">{fallback ?? <p role="status">This App component is disabled.</p>}</div>
  </>;
  if (!declaration.enabled) return <p role="alert">This App component was disabled. Reload the page before continuing.</p>;
  if (!Loaded) return <Skeleton className="h-32" />;
  const updated = releaseChanged;
  return <>
    {descriptor.isError ? <div role="alert"><Text>This App component is unavailable.</Text><Button type="button" onClick={() => { void descriptor.refetch(); }}>Retry view</Button></div> : null}
    {updated ? <div role="status"><Text>A new version of this view is available.</Text><Button disabled={busy > 0} onClick={async () => {
      if (await confirm({title: 'Reload App view?', message: 'Unsaved changes in this view will be discarded.', confirmLabel: 'Reload view'})) {
        setLoaded(null); setFailure(false); setReload(value => value + 1);
      }
    }}>Reload view</Button></div> : null}
    <Boundary key={loadedDigest} onError={() => setFailure(true)}><UIPrimitivesProvider value={{...AppPatterns, DataTable, Stat, Progress, LineChart, BridgeChart, Tabs, Badge: StatusBadge, Button, Input, Select, Textarea, Text, Surface, Stack, Inline, Modal: AppModal, EntryRegion: EntryRegionBridge, AsyncCombobox, DateInput, FilePreview}}>
      <AppUIProvider value={{...api, context, lifecycle: composedLifecycle}}><EntryRegionHostContext.Provider value={composedLifecycle || null}><Loaded {...effectiveProps} /></EntryRegionHostContext.Provider></AppUIProvider>
    </UIPrimitivesProvider></Boundary>
  </>;
}
