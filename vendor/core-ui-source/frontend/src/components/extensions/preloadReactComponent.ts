import apiClient from '../../api/client';
import {supportsSDKRange} from './AppReactComponentHost';
import {loadReactArtifact} from './reactArtifactLoader';

/** Warm public code only. The rendering host still obtains a fresh admission. */
export async function preloadReactComponent(appId: string, componentKey: string, workspaceId: string, props: Record<string, unknown>, signal: AbortSignal) {
  const {data} = await apiClient.post(`/extensions/${encodeURIComponent(appId)}/components/${encodeURIComponent(componentKey)}/mount`,
    {placement: 'entry_compose', props}, {signal, headers: {'X-Integral-Scope': `ws:${workspaceId}`}});
  if (signal.aborted || !data.enabled || !supportsSDKRange(data.component.sdk_range)) return;
  await loadReactArtifact(data.artifact_url);
}
