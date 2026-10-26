'use strict';
// Run only against a new temporary installation. Never attach to a user's home.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { invocation, startCore, runCli } = require('@integral/desktop-host/core-runtime');
const { localSession } = require('@integral/desktop-host/local-session');
const assert = require('node:assert/strict');
const { createProfileInitializer } = require('../desktop/accounts/local-profile');

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

async function qualifyRuntime(resources = path.join(__dirname, '../resources')) {
  // Explicit empty overrides force the integrity-pinned bundled artifacts.
  const command = invocation({resources, command: '', prefix: ''});
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'integral-one-runtime-'));
  try {
    const runtime = await startCore({home, resources, command});
    if (!runtime.owned) throw new Error('A fresh qualification home must own its runtime.');
    const session = await localSession(runtime);
    if (!session.access_token || !session.refresh_token) throw new Error('Controller session is incomplete.');
    console.log('Pinned runtime startup, running local contract and controller session: passed.');
    fs.mkdirSync(path.join(home, 'one-account'), {mode:0o700});
    const initialize = () => createProfileInitializer({getProfile:()=>({name:'Signup qualification'}),authorize(){}});
    await initialize()(runtime);
    const api = async (current, token, method='GET', body) => {
      const response = await fetch(new URL(method==='GET'?'/api/auth/me':'/api/auth/update-profile',current.web_url), {
        method, redirect:'error', signal:AbortSignal.timeout(10000),
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        ...(body?{body:JSON.stringify(body)}:{}),
      });
      assert.ok(response.ok,'Synthetic profile API must succeed');const data=await response.json();return data.user||data;
    };
    const seeded=await api(runtime,session.access_token);
    assert.equal(seeded.display_name,'Signup qualification','The signed-in name must be saved in Core');
    await api(runtime,session.access_token,'PUT',{display_name:'Chosen local name'});
    assert.equal((await runCli(command,['stop','--home',home,'--json','--if-pid',String(runtime.pid),'--if-created',String(runtime.process_created)])).state,'stopped');
    const restarted=await startCore({home,resources,command});
    assert.equal(restarted.installation_id,runtime.installation_id);
    await initialize()(restarted);
    const renewed=await localSession(restarted),retained=await api(restarted,renewed.access_token);
    assert.equal(retained.id,seeded.id);assert.equal(retained.display_name,'Chosen local name');
    console.log('Account display name persisted through the real Core API; local edit and owner identity retained after cold restart: passed.');
  } catch (error) {
    // Read only the new synthetic home's logs; never print installation files.
    console.error(runtimeDiagnostics(home));
    throw error;
  } finally {
    // Stop before removal. If stopping fails, retain the synthetic home for recovery.
    const stopped = await runCli(command, ['stop', '--home', home, '--json']);
    if (stopped.state !== 'stopped') throw new Error('Runtime shutdown was not confirmed; synthetic home retained.');
    fs.rmSync(home, {recursive: true, force: true});
  }
}

module.exports = {runtimeDiagnostics, qualifyRuntime};
if (require.main === module) qualifyRuntime(process.argv[2] ? path.resolve(process.argv[2]) : undefined).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
