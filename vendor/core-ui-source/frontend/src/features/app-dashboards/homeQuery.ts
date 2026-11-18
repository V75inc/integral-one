import type { QueryClient } from '@tanstack/react-query';
import { dashboardsApi, isHomeAccessDenied, type AppHomeResponse } from '../../api/dashboards';

/** An authoritative refusal clears both Home caches until an authorized read succeeds. */
export async function readHomeQuery(client: QueryClient, appId: string, workspaceId: string | undefined, includeData = true): Promise<AppHomeResponse> {
  try {
    return await dashboardsApi.home(appId, includeData);
  } catch (error) {
    if (isHomeAccessDenied(error)) {
      client.setQueriesData<AppHomeResponse>({
        predicate: query => ['app-home-definition', 'app-home-data'].includes(String(query.queryKey[0]))
          && query.queryKey[1] === appId && query.queryKey[2] === workspaceId,
      }, { home: null, error: 'home_access_denied' });
    }
    throw error;
  }
}
