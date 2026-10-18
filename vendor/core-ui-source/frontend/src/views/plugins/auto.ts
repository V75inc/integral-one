import {
  operationalModelDraftsApi,
  type SubstrateResponse,
} from '../../api/operationalModelDrafts';

let _substrateCache: SubstrateResponse | null = null;
let _initPromise: Promise<SubstrateResponse | null> | null = null;

export async function initOperationalModelPlugins(): Promise<SubstrateResponse | null> {
  if (_substrateCache) return _substrateCache;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const sub = await operationalModelDraftsApi.substrate();
      _substrateCache = sub;
      return sub;
    } catch (err) {

      console.warn('operational-model substrate fetch failed', err);
      return null;
    } finally {
      _initPromise = null;
    }
  })();
  return _initPromise;
}

export function getDiscoveredPlugins(): SubstrateResponse | null {
  return _substrateCache;
}

export function _resetForTests(): void {
  _substrateCache = null;
  _initPromise = null;
}
