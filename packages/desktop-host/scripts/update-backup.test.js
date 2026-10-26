'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { backupRuntime } = require('../lib/update-backup');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'one-update-backup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtime = { home: path.join(root, 'core'), owned: true, cli: {} }, calls = [];
  const directory = path.join(root, 'backups');
  const stop = async ({ requireExclusive }) => { assert.equal(requireExclusive, true); calls.push('stop'); runtime.owned = false; runtime.stopped = true; };
  const runCli = async (_cli, args) => { calls.push(args[0]); fs.writeFileSync(args[args.indexOf('--output') + 1], 'cold snapshot', { mode: 0o600 }); };
  return { root, runtime, directory, stop, runCli, calls };
}
test('update backup follows an exclusive stop and is written outside the installation', async t => {
  const f = fixture(t), result = await backupRuntime(f);
  assert.deepEqual(f.calls, ['stop', 'backup']);
  assert.equal(result.home, f.runtime.home); assert.equal(fs.readFileSync(result.archive, 'utf8'), 'cold snapshot');
  assert.equal(path.dirname(result.directory), f.directory);
});
test('failed shutdown, missing backup and a backup inside the live store prevent replacement', async t => {
  const f = fixture(t);
  await assert.rejects(backupRuntime({ ...f, stop: async () => { throw new Error('owned elsewhere'); } }), /owned elsewhere/);
  assert.equal(fs.existsSync(f.directory), false);
  await assert.rejects(backupRuntime({ ...f, directory: path.join(f.runtime.home, 'backups') }), /outside/);
  await assert.rejects(backupRuntime({ ...f, runCli: async () => {} }));
});
test('a symlinked backup directory is refused', { skip: process.platform === 'win32' }, async t => {
  const f = fixture(t), elsewhere = path.join(f.root, 'elsewhere'); fs.mkdirSync(elsewhere); fs.symlinkSync(elsewhere, f.directory);
  await assert.rejects(backupRuntime(f), /symbolic link/);
  assert.deepEqual(fs.readdirSync(elsewhere), []);
});
