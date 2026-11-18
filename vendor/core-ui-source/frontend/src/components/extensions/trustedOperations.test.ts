import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AxiosError} from 'axios';
import {invokeTrustedOperation} from './trustedOperations';
const success = {app_id: 'a', operation_key: 'save', output: {id: 'record'}};
beforeEach(async () => {sessionStorage.clear(); const moduleName = 'node:crypto'; const {webcrypto} = await import(moduleName); vi.stubGlobal('crypto', webcrypto);});
describe('trusted UI commands', () => {
  it('deduplicates concurrent submits and snapshots the dispatched payload', async () => {
    let resolve!: (value: typeof success) => void;
    const dispatch = vi.fn((_input: Record<string, unknown>, _intent: string) => new Promise<typeof success>(done => {resolve = done;}));
    const payload = {amount: 12};
    const first = invokeTrustedOperation(['u','ws','a','component'], 'save', payload, dispatch, () => true);
    const second = invokeTrustedOperation(['u','ws','a','component'], 'save', {amount: 12}, dispatch, () => true);
    payload.amount = 99;
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    expect(dispatch.mock.calls[0][0]).toEqual({amount: 12});
    resolve(success); await Promise.all([first, second]);
    expect(sessionStorage.length).toBe(0);
  });
  it('retains the original key after network uncertainty and never retries automatically', async () => {
    const dispatch = vi.fn().mockRejectedValueOnce(new AxiosError('Network failed')).mockResolvedValue(success);
    const run = () => invokeTrustedOperation(['u','ws','a','component'], 'save', {amount: 12}, dispatch, () => true);
    await expect(run()).rejects.toMatchObject({outcome: 'unconfirmed'});
    expect(dispatch).toHaveBeenCalledTimes(1);
    await run();
    expect(dispatch.mock.calls[0][1]).toBe(dispatch.mock.calls[1][1]);
  });
  it('partitions retry identity by principal and workspace', async () => {
    const dispatch = vi.fn().mockRejectedValue(new AxiosError('Network failed'));
    for (const scope of [['u','ws'], ['v','ws'], ['u','other']]) await expect(invokeTrustedOperation(scope, 'save', {}, dispatch, () => true)).rejects.toThrow();
    expect(new Set(dispatch.mock.calls.map(call => call[1])).size).toBe(3);
  });
  it('suppresses dispatch before a stale mount and marks late writes unconfirmed', async () => {
    const dispatch = vi.fn().mockResolvedValue(success);
    await expect(invokeTrustedOperation(['u'], 'save', {}, dispatch, () => false)).rejects.toThrow('no longer active');
    expect(dispatch).not.toHaveBeenCalled();
    let current = true;
    dispatch.mockImplementation(async () => {current = false; return success;});
    await expect(invokeTrustedOperation(['u'], 'save', {}, dispatch, () => current)).rejects.toMatchObject({outcome: 'unconfirmed'});
    expect(sessionStorage.length).toBe(1);
  });
  it('does not turn withheld output into a successful empty result', async () => {
    const receipt = {id: `o.OperationExecutionReceipt.${'a'.repeat(64)}`, status: 'succeeded', replayed: true};
    const dispatch = vi.fn().mockResolvedValue({output_disposition: 'withheld', current_state_verified: false, operation_receipt: receipt});
    await expect(invokeTrustedOperation(['u'], 'save', {}, dispatch, () => true)).rejects.toThrow('completed earlier');
    expect(sessionStorage.length).toBe(0);
  });
  it('reports the legacy broker replay marker as unavailable without inventing an operation receipt', async () => {
    const dispatch = vi.fn().mockResolvedValue({app_id: 'a', operation_key: 'list', operation_class: 'read', output_disposition: 'available', output: {replayed: true, result_unavailable: true}, receipt: {status: 'succeeded'}});
    await expect(invokeTrustedOperation(['u'], 'list', {}, dispatch, () => true)).rejects.toMatchObject({outcome: 'withheld', message: expect.stringMatching(/result.*unavailable/i), operationReceipt: undefined});
    expect(dispatch).toHaveBeenCalledOnce();
  });
  it('works on a page without SubtleCrypto (plain HTTP) and keeps the same key for the same action', async () => {
    vi.stubGlobal('crypto', {getRandomValues: (a: Uint8Array) => a.fill(7)});
    const dispatch = vi.fn().mockRejectedValueOnce(new AxiosError('Network failed')).mockResolvedValue(success);
    const run = () => invokeTrustedOperation(['u','ws','a','component'], 'save', {amount: 12}, dispatch, () => true);
    await expect(run()).rejects.toMatchObject({outcome: 'unconfirmed'});
    await run();
    expect(dispatch.mock.calls[0][1]).toBe(dispatch.mock.calls[1][1]);
  });
});
