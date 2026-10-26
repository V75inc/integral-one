'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

async function backupRuntime({ runtime, stop, directory, runCli }) {
  if (!runtime || typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('A local runtime and backup directory are required.');
  await stop({ requireExclusive: true });
  if (!runtime.stopped) throw new Error('Stop the local runtime before backing up.');
  const relative = path.relative(path.resolve(runtime.home), path.resolve(directory));
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)))
    throw new Error('Save update backups outside the installation.');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Update backups must not use a symbolic link.');
  const target = path.join(directory, `${Date.now()}-${randomUUID()}`);
  fs.mkdirSync(target, { mode: 0o700 });
  const archive = path.join(target, 'core.tar.gz');
  await runCli(runtime.cli, ['backup', '--home', runtime.home, '--output', archive, '--json']);
  const stat = fs.lstatSync(archive);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error('The update backup could not be verified.');
  return { directory: target, home: runtime.home, archive };
}
module.exports = { backupRuntime };
