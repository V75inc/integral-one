import apiClient from './client';

export async function mintWsTicket(): Promise<string | null> {
  try {
    const response = await apiClient.post<{ ticket?: string }>('/auth/ws-ticket');
    return response.data?.ticket ?? null;
  } catch {
    return null;
  }
}
