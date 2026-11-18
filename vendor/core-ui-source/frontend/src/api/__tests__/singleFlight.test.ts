import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAllSingleFlights, createSingleFlight } from '../singleFlight';

afterEach(() => { vi.useRealTimers(); clearAllSingleFlights(); });

describe('createSingleFlight', () => {
  it('shares a slow read until it settles, then starts its freshness window', async () => {
    vi.useFakeTimers();
    const sf = createSingleFlight<number>(1000);
    let resolve!: (value: number) => void;
    const fn = vi.fn(() => new Promise<number>(done => { resolve = done; }));
    const first = sf.run('slow', fn);
    await vi.advanceTimersByTimeAsync(2000);
    const overlapping = sf.run('slow', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    resolve(7);
    expect(await overlapping).toBe(7);
    expect(await first).toBe(7);
    await vi.advanceTimersByTimeAsync(500);
    expect(await sf.run('slow', fn)).toBe(7);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(501);
    void sf.run('slow', fn);
    expect(fn).toHaveBeenCalledTimes(2);
    resolve(8);
  });

  it('does not restore an invalidated pending read when it finishes', async () => {
    const sf = createSingleFlight<number>(1000);
    let resolve!: (value: number) => void;
    const old = sf.run('key', () => new Promise<number>(done => { resolve = done; }));
    clearAllSingleFlights();
    expect(await sf.run('key', async () => 2)).toBe(2);
    resolve(1);
    expect(await old).toBe(1);
    expect(await sf.run('key', async () => 3)).toBe(2);
  });
  it('shares one call between concurrent callers', async () => {
    const sf = createSingleFlight<number>(1000);
    const fn = vi.fn().mockResolvedValue(1);
    const r = await Promise.all([sf.run('k', fn), sf.run('k', fn), sf.run('k', fn)]);
    expect(r).toEqual([1, 1, 1]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps keys separate', async () => {
    const sf = createSingleFlight<number>(1000);
    const fn = vi.fn().mockResolvedValue(1);
    await Promise.all([sf.run('a', fn), sf.run('b', fn)]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures', async () => {
    const sf = createSingleFlight<number>(1000);
    const fn = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(2);
    await expect(sf.run('k', fn)).rejects.toThrow('x');
    await expect(sf.run('k', fn)).resolves.toBe(2);
  });

  it('expires after the ttl', async () => {
    const sf = createSingleFlight<number>(10);
    const fn = vi.fn().mockResolvedValue(1);
    await sf.run('k', fn);
    await new Promise(r => setTimeout(r, 25));
    await sf.run('k', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('is dropped by clearAllSingleFlights (a write happened)', async () => {
    const sf = createSingleFlight<number>(1000);
    const fn = vi.fn().mockResolvedValue(1);
    await sf.run('k', fn);
    clearAllSingleFlights();
    await sf.run('k', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

import axios, { type AxiosAdapter } from 'axios';
import { dedupeConcurrentGets } from '../singleFlight';

describe('dedupeConcurrentGets', () => {
  function makeClient() {
    let calls = 0;
    const pending: Array<() => void> = [];
    const gate = { release: () => { pending.splice(0).forEach(fn => fn()); } };
    const adapter: AxiosAdapter = config => {
      calls += 1;
      const n = calls;
      return new Promise(resolve => {
        pending.push(() =>
          resolve({ data: { n, url: config.url }, status: 200, statusText: 'OK', headers: {}, config }),
        );
      });
    };
    const client = axios.create({ adapter });
    dedupeConcurrentGets(client);
    return { client, gate, calls: () => calls };
  }

  it('shares overlapping identical GETs and gives each caller its own data', async () => {
    const { client, gate, calls } = makeClient();
    const a = client.get('/x', { params: { q: 1 } });
    const b = client.get('/x', { params: { q: 1 } });
    gate.release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(calls()).toBe(1);
    expect(ra.data).toEqual(rb.data);
    expect(ra.data).not.toBe(rb.data);
  });

  it('does not share different URLs, params or non-GETs, and never serves a settled call', async () => {
    const { client, gate, calls } = makeClient();
    const reqs = [client.get('/x'), client.get('/y'), client.get('/x', { params: { q: 2 } }), client.post('/x', {})];
    gate.release();
    await Promise.all(reqs);
    expect(calls()).toBe(4);
    const later = client.get('/x');
    gate.release();
    await later;
    expect(calls()).toBe(5);
  });

  it('leaves aborted-capable requests alone', async () => {
    const { client, gate, calls } = makeClient();
    const ac = new AbortController();
    const p = [client.get('/x', { signal: ac.signal }), client.get('/x', { signal: ac.signal })];
    gate.release();
    await Promise.all(p);
    expect(calls()).toBe(2);
  });
});

import { clearSharedGets } from '../singleFlight';

describe('reusable navigation GETs', () => {
  it('does not issue another network read while a slow reusable GET is pending', async () => {
    vi.useFakeTimers();
    const releases: Array<() => void> = [];
    const adapter = vi.fn<AxiosAdapter>(config => new Promise(resolve => {
      releases.push(() => resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config }));
    }));
    const client = axios.create({ adapter });
    dedupeConcurrentGets(client, { reuseMs: 1000, reusable: () => true });
    const first = client.get('/apps');
    await vi.advanceTimersByTimeAsync(2000);
    const overlapping = client.get('/apps');
    expect(adapter).toHaveBeenCalledTimes(1);
    releases.forEach(release => release());
    await Promise.all([first, overlapping]);
    await vi.advanceTimersByTimeAsync(500);
    await client.get('/apps');
    expect(adapter).toHaveBeenCalledTimes(1);
  });
  function makeReusable() {
    let calls = 0;
    const adapter: AxiosAdapter = config => {
      calls += 1;
      const n = calls;
      return Promise.resolve({ data: { n }, status: 200, statusText: 'OK', headers: {}, config });
    };
    const client = axios.create({ adapter });
    dedupeConcurrentGets(client, { reuseMs: 10_000, reusable: p => p.startsWith('/apps') });
    return { client, calls: () => calls };
  }

  it('reuses a settled reusable GET until cleared, per caller copy', async () => {
    const { client, calls } = makeReusable();
    const a = await client.get('/apps');
    const b = await client.get('/apps');
    expect(calls()).toBe(1);
    expect(a.data).toEqual(b.data);
    expect(a.data).not.toBe(b.data);
    clearSharedGets();
    await client.get('/apps');
    expect(calls()).toBe(2);
  });

  it('never reuses non-listed URLs once settled', async () => {
    const { client, calls } = makeReusable();
    await client.get('/entries');
    await client.get('/entries');
    expect(calls()).toBe(2);
  });

  it('separates users and scopes', async () => {
    const { client, calls } = makeReusable();
    await client.get('/apps', { headers: { Authorization: 'Bearer a' } });
    await client.get('/apps', { headers: { Authorization: 'Bearer b' } });
    await client.get('/apps', { headers: { 'X-Integral-Scope': 'ws:1' } });
    expect(calls()).toBe(3);
  });
});
