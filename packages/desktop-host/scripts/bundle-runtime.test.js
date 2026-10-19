'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bundleRuntime } = require('../lib/bundle-runtime');

test('bundling validates and packages Core without requiring a retired agent wheel', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'integral-bundle-'));
  try {
    const core = path.join(root, 'integral_core-test.whl');
    const uv = path.join(root, 'uv-input');
    fs.writeFileSync(core, 'reviewed core');
    fs.writeFileSync(uv, 'reviewed launcher');
    const base = path.join(root, 'resources', 'core');
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(path.join(base, 'jvagent-stale.whl'), 'old artifact');
    bundleRuntime({ INTEGRAL_CORE_WHEEL: core, INTEGRAL_UV_BINARY: uv }, {
      base, inspect: (file, args) => {
        assert.equal(file, uv);
        assert.deepEqual(args, ['tool', 'run', '--python', '3.12', '--index-url', 'https://pypi.org/simple',
          '--from', core, 'integral', 'status', '--json']);
        return JSON.stringify({ contract_version: 1, default_harness_provider_id: "integral_native", supported_deployment_profiles: ["server", "desktop_single_user"], runtime_contract_version: 1, supported_runtime_presets: ['hosted', 'local'], desktop_contract_version: 1, desktop_assets_available: true });
      },
    });
    const manifest = JSON.parse(fs.readFileSync(path.join(base, 'runtime.json')));
    const { invocation } = require('../lib/core-runtime');
    const command = invocation({ resources: path.dirname(base), command: '', prefix: '' });
    assert.equal(command.file, path.join(base, process.platform === 'win32' ? 'uv.exe' : 'uv'));
    fs.writeFileSync(path.join(base, path.basename(core)), 'corrupt artifact');
    assert.throws(() => invocation({ resources: path.dirname(base), command: '', prefix: '' }), /integrity check/);
    fs.copyFileSync(core, path.join(base, path.basename(core)));
    assert.equal(manifest.coreWheel, path.basename(core));
    assert.equal(manifest.agentWheel, undefined);
    assert.deepEqual(Object.keys(manifest.sha256).sort(), [path.basename(core), 'uv'].sort());
    assert.equal(fs.existsSync(path.join(base, 'jvagent-stale.whl')), false);
    assert.equal(fs.readFileSync(path.join(base, path.basename(core)), 'utf8'), 'reviewed core');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing resident assets reject the wheel before replacing an existing bundle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'integral-incomplete-bundle-'));
  try {
    const core = path.join(root, 'core.whl');
    const uv = path.join(root, 'uv');
    const base = path.join(root, 'bundle');
    fs.writeFileSync(core, 'incomplete wheel'); fs.writeFileSync(uv, 'launcher');
    fs.mkdirSync(base); fs.writeFileSync(path.join(base, 'keep'), 'previous reviewed bundle');
    assert.throws(() => bundleRuntime({ INTEGRAL_CORE_WHEEL: core, INTEGRAL_UV_BINARY: uv }, {
      base, inspect: () => JSON.stringify({ contract_version: 1, default_harness_provider_id: 'integral_native', supported_deployment_profiles: ['desktop_single_user'], runtime_contract_version: 1, supported_runtime_presets: ['hosted', 'local'], desktop_contract_version: 1, desktop_assets_available: false }),
    }), /resident skills/);
    assert.equal(fs.readFileSync(path.join(base, 'keep'), 'utf8'), 'previous reviewed bundle');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
