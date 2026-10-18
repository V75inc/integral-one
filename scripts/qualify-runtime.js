'use strict';
// Run only against a new temporary installation. Never attach to a user's home.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { invocation, startCore, runCli } = require('@integral/desktop-host/core-runtime');
const { localSession } = require('@integral/desktop-host/local-session');

async function qualifyRuntime() {
  const resources = path.join(__dirname, '../resources');
  // Explicit empty overrides force the integrity-pinned bundled artifacts.
  const command = invocation({resources, command: '', prefix: ''});
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'integral-one-runtime-'));
  try {
    const runtime = await startCore({home, resources, command});
    if (!runtime.owned) throw new Error('A fresh qualification home must own its runtime.');
    const session = await localSession(runtime);
    if (!session.access_token || !session.refresh_token) throw new Error('Controller session is incomplete.');
    console.log('Pinned runtime startup, running local contract and controller session: passed.');
  } finally {
    // Stop before removal. If stopping fails, retain the synthetic home for recovery.
    await runCli(command, ['stop', '--home', home, '--json']);
    fs.rmSync(home, {recursive: true, force: true});
  }
}

qualifyRuntime().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
