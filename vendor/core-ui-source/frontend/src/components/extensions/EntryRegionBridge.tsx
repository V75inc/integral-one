/** Lazy boundary keeps the public SDK host independent of the view registry. */
import {createContext, lazy, Suspense, useCallback, useContext, useLayoutEffect, useState} from 'react';
import {useAppUI} from '@integral/sdk-react';
import type {EntryRegionProps} from '@integral/sdk-react';
import type {ContributionLifecycleApi} from '../entries/contributionLifecycle';
const NativeEntryRegion = lazy(() => import('./NativeEntryRegion'));
export const EntryRegionHostContext = createContext<ContributionLifecycleApi | null>(null);
export function EntryRegionBridge(props: EntryRegionProps) {
  const ui = useAppUI();
  const lifecycle = useContext(EntryRegionHostContext);
  const [mounted, setMounted] = useState(false);
  const onMounted = useCallback(() => setMounted(true), []);
  useLayoutEffect(() => {
    if (!mounted) return lifecycle?.register({requestValidate: async () => ({ok: false, error: 'The form region is loading.'}), requestSubmit: async () => ({ok: false, error: 'The form region is loading.'})});
  }, [mounted, lifecycle?.register]);
  if (ui.preview) return <p role="status">Entry regions are unavailable in preview.</p>;
  if (!lifecycle) return <p role="alert">Entry regions require an Entry contribution.</p>;
  return <Suspense fallback={<p role="status">Loading form region…</p>}><NativeEntryRegion {...props} lifecycle={lifecycle} onMounted={onMounted} /></Suspense>;
}
