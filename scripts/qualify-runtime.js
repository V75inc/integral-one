'use strict';
// Run only against a new temporary installation. Never attach to a user's home.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { invocation, startCore, runCli } = require('@integral/desktop-host/core-runtime');
const { localSession } = require('@integral/desktop-host/local-session');

function runtimeDiagnostics(home) {
  let installation;
  try { installation = JSON.parse(fs.readFileSync(path.join(home, 'installation.json'), 'utf8')); }
  catch { return 'Runtime diagnostics unavailable without the synthetic installation secret inventory.'; }
  const secrets = Object.entries(installation)
    .filter(([key, value]) => /key|token|password|secret/i.test(key) && typeof value === 'string' && value)
    .flatMap(([, value]) => [value, encodeURIComponent(value)]);
  return ['database', 'supervisor', 'api', 'web'].flatMap(name => {
    const file = path.join(home, 'logs', name + '.log');
    if (!fs.existsSync(file)) return [];
    let log = fs.readFileSync(file, 'utf8');
    for (const secret of secrets) log = log.split(secret).join('[redacted]');
    log = log.replace(/(postgres(?:ql)?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@');
    return [`${name}.log (synthetic runtime):\n${log.slice(-6000)}`];
  }).join('\n');
}

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
  } catch (error) {
    // Read only the new synthetic home's logs; never print installation files.
    console.error(runtimeDiagnostics(home));
    throw error;
  } finally {
    // Stop before removal. If stopping fails, retain the synthetic home for recovery.
    await runCli(command, ['stop', '--home', home, '--json']);
    fs.rmSync(home, {recursive: true, force: true});
  }
}

module.exports = {runtimeDiagnostics};
if (require.main === module) qualifyRuntime().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
