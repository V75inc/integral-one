'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { prepareUpdate } = require('../desktop/update-backup');
test('One account records and local integrity keys accompany the cold Core backup unchanged', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'one-account-backup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'core'), directory = path.join(root, 'update-backups', 'fixture');
  fs.mkdirSync(path.join(home, 'one-account'), { recursive: true }); fs.mkdirSync(directory, { recursive: true });
  for (const file of ['activation.json', 'setup-key.json']) fs.writeFileSync(path.join(home, 'one-account', file), file, { mode: 0o600 });
  const host = { prepareUpdate: async args => { assert.equal(args.backupDirectory, path.join(root, 'update-backups')); return { home, directory }; } };
  assert.equal(await prepareUpdate(host, root), directory);
  for (const file of ['activation.json', 'setup-key.json']) assert.equal(fs.readFileSync(path.join(directory, 'one-account', file), 'utf8'), file);
  if (process.platform !== 'win32') {
    fs.rmSync(path.join(directory, 'one-account'), { recursive: true });
    fs.symlinkSync(path.join(root, 'outside'), path.join(home, 'one-account', 'unexpected'));
    await assert.rejects(prepareUpdate(host, root), /symbolic links/);
  }
});
