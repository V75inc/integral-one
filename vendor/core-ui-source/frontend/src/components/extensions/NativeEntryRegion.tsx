/** Public EntryRegion adapter. All data/widgets stay on the host Entry's track. */
import {useCallback, useLayoutEffect, useMemo, useRef} from 'react';
import type {EntryRegionProps} from '@integral/sdk-react';
import {useTrackViews} from '../../hooks/useTrackViews';
import {matchSavedViewByKey} from '../../features/view-designer/matchSavedView';
import {NativeContributionHost} from '../entries/NativeContributionHost';
import type {ContributionLifecycleApi, ContributionLifecycleHandle} from '../entries/contributionLifecycle';
import {runContributionHandles} from './contributionHandles';
export default function NativeEntryRegion({viewKey, fields, columns = 1, className, lifecycle, onMounted}: EntryRegionProps & {lifecycle: ContributionLifecycleApi; onMounted: () => void}) {
  const views = useTrackViews(viewKey ? lifecycle.trackId : undefined);
  const members = useRef(new Map<symbol, ContributionLifecycleHandle>());
  const active = useRef(false);
  const selected = viewKey ? matchSavedViewByKey(views.data || [], viewKey) : undefined;
  const valid = !selected?.config?.component_key && Boolean(lifecycle.trackId && (viewKey ? selected && !views.isError : fields?.length)) && !(viewKey && fields);
  const ready = useRef(false);
  useLayoutEffect(() => {active.current = true; ready.current = valid; return () => {active.current = false;};}, [valid]);
  const register = useCallback((handle: ContributionLifecycleHandle) => {
    const token = Symbol(); members.current.set(token, handle);
    return () => {members.current.delete(token);};
  }, []);
  const nested = useMemo(() => ({...lifecycle, register}), [lifecycle, register]);
  useLayoutEffect(() => lifecycle.register({
    requestValidate: async () => (ready.current && active.current && (!viewKey || members.current.size > 0)) ? runContributionHandles(members.current.values(), 'validate', undefined, () => active.current && ready.current) : {ok: false, error: 'The form region is unavailable.'},
    requestSubmit: async id => (ready.current && active.current && (!viewKey || members.current.size > 0)) ? runContributionHandles(members.current.values(), 'submit', id, () => active.current && ready.current) : {ok: false, error: 'The form region is unavailable.'},
  }), [lifecycle.register, viewKey]);
  useLayoutEffect(onMounted, [onMounted]);
  if (!lifecycle.trackId) return <p role="alert">The form region has no track.</p>;
  if (viewKey && views.isPending) return <p role="status">Loading form region…</p>;
  if (!valid) return <p role="alert">The form region is unavailable.</p>;
  // Executable views cannot recursively mount another native App component.
  if (selected?.config?.component_key) return <p role="alert">A form region cannot mount another App component.</p>;
  return <NativeContributionHost trackId={lifecycle.trackId} contribution={viewKey ? {view: viewKey} : {view_type: 'form_region', config: {fields, columns, show_labels: true}}}
    lifecycle={nested} minHeight={0} className={className} />;
}
