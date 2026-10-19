import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the API client module before importing operationalModelsApi.
vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn(),
  },
}));

import apiClient from './client';
import { operationalModelsApi } from './operationalModels';

describe('operationalModelsApi.delete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls DELETE /operational-models/{id} with the given id', async () => {
    await operationalModelsApi.delete('cp-abc-123');
    expect(apiClient.delete).toHaveBeenCalledWith('/operational-models/cp-abc-123');
  });

  it('returns without throwing on success', async () => {
    await expect(operationalModelsApi.delete('cp-abc-123')).resolves.not.toThrow();
  });
});

describe('operationalModelsApi.rescanPackages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requests a privileged package catalog rescan', async () => {
    const response = {
      added: [],
      updated: [{ slug: 'venture-journey' }],
      removed: [],
      issues: [],
      reconciled_removed: [],
    };
    vi.mocked(apiClient.post).mockResolvedValue({ data: response });

    await expect(operationalModelsApi.rescanPackages()).resolves.toEqual(response);
    expect(apiClient.post).toHaveBeenCalledWith('/admin/packages/rescan', {});
  });
});
