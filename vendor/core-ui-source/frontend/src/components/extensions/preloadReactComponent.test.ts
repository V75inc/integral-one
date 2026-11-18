import {beforeEach, expect, it, vi} from 'vitest';
import apiClient from '../../api/client';
import {loadReactArtifact} from './reactArtifactLoader';
import {preloadReactComponent} from './preloadReactComponent';
vi.mock('../../api/client', () => ({default: {post: vi.fn()}}));
vi.mock('./reactArtifactLoader', () => ({loadReactArtifact: vi.fn().mockResolvedValue({})}));
beforeEach(() => {vi.clearAllMocks();});
it('warms admitted code with explicit scope and declared props, without business reads', async () => {
  vi.mocked(apiClient.post).mockResolvedValue({data: {enabled:true,component:{sdk_range:'^1.1.0'},artifact_url:'/approved.mjs'}});
  const controller = new AbortController();
  await preloadReactComponent('app','editor','workspace',{layout:'wide'},controller.signal);
  expect(apiClient.post).toHaveBeenCalledExactlyOnceWith('/extensions/app/components/editor/mount', {placement:'entry_compose',props:{layout:'wide'}}, {signal:controller.signal,headers:{'X-Integral-Scope':'ws:workspace'}});
  expect(loadReactArtifact).toHaveBeenCalledExactlyOnceWith('/approved.mjs');
});
it.each([{enabled:false,component:{sdk_range:'^1.1.0'}},{enabled:true,component:{sdk_range:'^2.0.0'}}])('does not execute disabled or incompatible code', async data => {
  vi.mocked(apiClient.post).mockResolvedValue({data});
  await preloadReactComponent('app','editor','workspace',{},new AbortController().signal);
  expect(loadReactArtifact).not.toHaveBeenCalled();
});
it('suppresses a delayed prefetch after leaving the track', async () => {
  let finish!: (result: any) => void;
  vi.mocked(apiClient.post).mockImplementation(() => new Promise(resolve => {finish=resolve;}));
  const controller = new AbortController();
  const work=preloadReactComponent('app','editor','workspace',{},controller.signal);
  controller.abort();finish({data:{enabled:true,component:{sdk_range:'^1.1.0'},artifact_url:'/approved.mjs'}});
  await work;expect(loadReactArtifact).not.toHaveBeenCalled();
});
