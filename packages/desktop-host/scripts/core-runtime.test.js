'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateWorkspace, invocation, startCore } = require('../lib/core-runtime');

test('workspace URL restricts insecure origins and embedded credentials', () => {
  assert.equal(validateWorkspace('http://127.0.0.1:9006/'), 'http://127.0.0.1:9006');
  assert.equal(validateWorkspace('https://integral.example/workspace'), 'https://integral.example/workspace');
  for (const url of ['http://remote.example', 'file:///tmp/app', 'javascript:alert(1)', 'https://user:secret@example.com']) {
    assert.throws(() => validateWorkspace(url));
  }
});
test('configured executable and arguments stay separate from a shell', () => {
  assert.deepEqual(invocation({ resources: '/missing', command: '/a b/python', prefix: '["-m","app.cli"]' }),
    { file: '/a b/python', args: ['-m', 'app.cli'] });
  assert.throws(() => invocation({ resources: '/missing', command: 'integral', prefix: '"up"' }));
});
test('desktop starts a blank Core installation and attaches without claiming an existing runtime', async () => {
  const calls = [];
  const runtime = await startCore({ home: '/private/home', resources: '/missing',
    command: { file: 'integral', args: [] }, request: async (url, options) => {
      assert.equal(url.href, 'http://127.0.0.1:9006/api/meta/deployment');
      assert.equal(options.redirect, 'error');
      return {ok: true, json: async () => ({runtime: {contract_version: 1, preset: 'local', identity: 'installation_owner'}})};
    }, runner: async (_cli, args) => {
      calls.push(args);
      return args[0] === 'status' ? { state: 'ready' } : {
        state: 'ready', contract_version: 1, deployment_profile: 'desktop_single_user', runtime_contract_version: 1, supported_runtime_presets: ['hosted', 'local'], desktop_contract_version: 1, harness_provider_id: 'integral_native', started: false, installation_id: 'abc', web_url: 'http://127.0.0.1:9006', home: '/private/home',
      };
    } });
  assert.equal(runtime.owned, false);
  assert.deepEqual(calls[0], ['up', '--home', '/private/home', '--no-open', '--json', '--profile', 'desktop_single_user']);
});
test('rejects incompatible descriptors and a remote local-runtime endpoint', async () => {
  for (const descriptor of [{ contract_version: 2 }, { contract_version: 1, web_url: 'https://remote.example' }]) {
    await assert.rejects(startCore({ home: '/home', resources: '/missing', command: { file: 'integral', args: [] },
      runner: async (_cli, args) => args[0] === 'status' ? { state: 'stopped' } : {
        state: 'ready', started: true, installation_id: 'abc', ...descriptor,
      } }));
  }
});

for (const harness of [undefined, 'jvagent']) {
  test(`rejects a Core runtime with legacy or missing harness identity: ${harness}`, async () => {
    await assert.rejects(startCore({home: '/home', resources: '/missing', command: {file: 'integral', args: []}, runner: async () => ({contract_version: 1, state: 'ready', deployment_profile: 'desktop_single_user', runtime_contract_version: 1, supported_runtime_presets: ['hosted', 'local'], desktop_contract_version: 1, started: true, installation_id: 'abc', web_url: 'http://127.0.0.1:9006', harness_provider_id: harness})}), /native-only harness/);
  });
}

test('Core-only bundled manifests launch without a legacy harness dependency', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'integral-runtime-'));
  const base = path.join(resources, 'core');
  fs.mkdirSync(base);
  try {
    const crypto = require('node:crypto');
    const wheel = 'integral_core-test.whl';
    const uvName = process.platform === 'win32' ? 'uv.exe' : 'uv';
    fs.writeFileSync(path.join(base, wheel), 'wheel');
    fs.writeFileSync(path.join(base, uvName), 'launcher');
    const hash = value => crypto.createHash('sha256').update(value).digest('hex');
    const manifest = { contract_version: 1, runtime_contract_version: 1, runtime_preset: 'local', coreWheel: wheel, deployment_profile: 'desktop_single_user', platform: process.platform, arch: process.arch,
      harness_provider_id: 'integral_native', sha256: { [wheel]: hash('wheel'), uv: hash('launcher') } };
    fs.writeFileSync(path.join(base, 'runtime.json'), JSON.stringify(manifest));
    const cli = invocation({ resources, command: '', prefix: '' });
    assert.deepEqual(cli.args, ['tool', 'run', '--python', '3.12', '--index-url', 'https://pypi.org/simple',
      '--from', path.join(base, manifest.coreWheel), 'integral']);
    fs.writeFileSync(path.join(base, 'runtime.json'), JSON.stringify({ ...manifest, agentWheel: 'retired-jvagent.whl' }));
    assert.throws(() => invocation({ resources, command: '', prefix: '' }), /Invalid bundled runtime/);
    fs.writeFileSync(path.join(base, 'runtime.json'), JSON.stringify({ ...manifest, contract_version: 2 }));
    assert.throws(() => invocation({ resources, command: '', prefix: '' }), /Invalid bundled runtime/);
    fs.writeFileSync(path.join(base, 'runtime.json'), JSON.stringify({ ...manifest, coreWheel: '../escape.whl' }));
    assert.throws(() => invocation({ resources, command: '', prefix: '' }), /Invalid bundled runtime/);
  } finally {
    fs.rmSync(resources, { recursive: true, force: true });
  }
});

test('rejects a profile label without the enforced desktop contract', async () => {
  await assert.rejects(startCore({ home: '/private/home', resources: '/missing', command: { file: 'integral', args: [] }, runner: async () => ({
    state: 'ready', contract_version: 1, deployment_profile: 'desktop_single_user', harness_provider_id: 'integral_native', started: true, installation_id: 'synthetic', web_url: 'http://127.0.0.1:19006',
  }) }), /single-owner profile/);
});


test('rejects a profile-only Core without the neutral runtime contract', async () => {
  await assert.rejects(startCore({ home: '/private/home', resources: '/missing',
    command: {file: 'integral', args: []}, runner: async () => ({
      contract_version: 1, state: 'ready', started: false, installation_id: 'abc',
      deployment_profile: 'desktop_single_user', desktop_contract_version: 1,
      harness_provider_id: 'integral_native', web_url: 'http://127.0.0.1:9006'
    }) }), /updated runtime/);
});


for (const capabilities of [{}, {runtime: {contract_version: 1, preset: 'hosted', identity: 'accounts'}}]) {
  test('a new CLI cannot disguise a legacy or hosted running API', async () => {
    await assert.rejects(startCore({home: '/home', resources: '/missing',
      command: {file: 'integral', args: []},
      runner: async () => ({contract_version: 1, state: 'ready', started: false,
        installation_id: 'abc', deployment_profile: 'desktop_single_user',
        desktop_contract_version: 1, runtime_contract_version: 1,
        supported_runtime_presets: ['local', 'hosted'], harness_provider_id: 'integral_native',
        web_url: 'http://127.0.0.1:9006'}),
      request: async () => ({ok: true, json: async () => capabilities})
    }), /older or incompatible/);
  });
}
