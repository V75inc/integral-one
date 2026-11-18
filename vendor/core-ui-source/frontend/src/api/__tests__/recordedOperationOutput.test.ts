import { describe, expect, it, vi } from 'vitest';
import apiClient from '../client';
import {
  extensionsApi,
  LegacyOperationOutputUnavailable,
  requireOperationOutput,
  RecordedOperationOutputWithheld,
  type AppOperationInvokeResponse,
} from '../extensions';

const receipt = { id: 'o.OperationExecutionReceipt.' + 'a'.repeat(64), status: 'succeeded' as const, replayed: true as const };

describe('recorded operation output', () => {
  it('preserves readable and legacy available output', () => {
    const legacy = { app_id: 'app', operation_key: 'record', output: { value: 1 } };
    expect(requireOperationOutput(legacy)).toBe(legacy);
    const available = { ...legacy, output_disposition: 'available' as const, current_state_verified: false as const, operation_receipt: receipt };
    expect(requireOperationOutput(available)).toBe(available);
    const businessData = {...legacy, output: {replayed: true, result_unavailable: true, rows: []}};
    expect(requireOperationOutput(businessData)).toBe(businessData);
  });

  it('cannot turn recorded completion into empty business output or a retry', () => {
    const result: AppOperationInvokeResponse = {
      output_disposition: 'withheld', current_state_verified: false, operation_receipt: receipt,
    };
    try {
      requireOperationOutput(result);
      throw new Error('Expected withheld output');
    } catch (error) {
      expect(error).toBeInstanceOf(RecordedOperationOutputWithheld);
      const withheld = error as RecordedOperationOutputWithheld;
      expect(withheld.retryable).toBe(false);
      expect(withheld.operationReceipt).toBe(receipt);
      expect(withheld.message).toContain('completed earlier');
      expect(withheld.message).toContain('current records have not been verified');
      expect('output' in withheld).toBe(false);
    }
    expect('output' in result).toBe(false);
  });
  it('rejects the legacy replay marker at the shared operation API boundary', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({data: {app_id: 'app', operation_key: 'run', output: {replayed: true, result_unavailable: true}}});
    try {
      await expect(extensionsApi.invokeOperation('app', 'run')).rejects.toBeInstanceOf(LegacyOperationOutputUnavailable);
      expect(post).toHaveBeenCalledOnce();
    } finally { post.mockRestore(); }
  });
});
