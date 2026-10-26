import api from './client';

export interface BuildMetadata {
  asset_version: string;
  core_version?: string | null;
}

export async function getBuildMetadata(): Promise<BuildMetadata> {
  const { data } = await api.get<BuildMetadata>('/meta/build');
  return data;
}
