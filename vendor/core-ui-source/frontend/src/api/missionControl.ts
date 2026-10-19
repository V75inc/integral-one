import apiClient from './client';
import { unwrapResource } from './helpers';
import type { App, Entry, Track } from '../types';
import type { Workspace } from './workspaces';

export interface MissionControlSnapshot {
  workspaces: Workspace[];
  apps: App[];
  tracks: Track[];
  preview_entries: Entry[];
  entries_today: number;
  active_tracks: number;
}

export const missionControlApi = {
  async getSnapshot(preview_limit = 50): Promise<MissionControlSnapshot> {
    const { data } = await apiClient.get('/me/mission-control', {
      params: { preview_limit },
    });
    return {
      workspaces: unwrapResource<Workspace[]>(data, 'workspaces'),
      apps: unwrapResource<App[]>(data, 'apps'),
      tracks: unwrapResource<Track[]>(data, 'tracks'),
      preview_entries: unwrapResource<Entry[]>(data, 'preview_entries'),
      entries_today: Number(data?.entries_today || 0),
      active_tracks: Number(data?.active_tracks || 0),
    };
  },
};
