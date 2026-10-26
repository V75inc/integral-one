'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startOrRetry } = require('../scripts/qualify-upgrade');

test('a startup timeout is stopped and tried once', async () => {
  const starts = [];
  const stops = [];
  const runtime = await startOrRetry(
    () => {
      starts.push('start');
      if (starts.length === 1) throw new Error('integral up: Startup timed out. See integral logs --home C:\\temp\\store');
      return { state: 'ready' };
    },
    (command, args) => { stops.push({ command, args }); return { state: 'stopped' }; },
    { home: 'C:\\temp\\store', command: { file: 'uv' } },
  );
  assert.deepEqual(runtime, { state: 'ready' });
  assert.equal(starts.length, 2);
  assert.deepEqual(stops, [{ command: { file: 'uv' }, args: ['stop', '--home', 'C:\\temp\\store', '--json'] }]);
});

test('a startup failure other than a timeout is not retried', async () => {
  let starts = 0;
  await assert.rejects(
    () => startOrRetry(
      () => { starts += 1; throw new Error('Startup failed: Private PostgreSQL failed to start'); },
      () => { throw new Error('stop should not run'); },
      { home: 'C:\\temp\\store', command: { file: 'uv' } },
    ),
    /Private PostgreSQL failed to start/,
  );
  assert.equal(starts, 1);
});

test('a second startup timeout is reported', async () => {
  let starts = 0;
  await assert.rejects(
    () => startOrRetry(
      () => { starts += 1; throw new Error('integral up: Startup timed out.'); },
      async () => ({ state: 'stopped' }),
      { home: 'C:\\temp\\store', command: { file: 'uv' } },
    ),
    /Startup timed out/,
  );
  assert.equal(starts, 2);
});
