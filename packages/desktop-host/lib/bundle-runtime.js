'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function bundleRuntime(env = process.env, {
  inspect = execFileSync, base,
} = {}) {
  if (!base) throw new Error("A product runtime output directory is required.");
  const core = env.INTEGRAL_CORE_WHEEL;
  const uv = env.INTEGRAL_UV_BINARY;
  if (![core, uv].every(value => value && fs.existsSync(value) && fs.statSync(value).isFile())) {
    throw new Error('Set INTEGRAL_CORE_WHEEL and INTEGRAL_UV_BINARY to reviewed local artifacts.');
  }
  const inspection = inspect(uv, ['tool', 'run', '--python', '3.12', '--index-url', 'https://pypi.org/simple',
    '--from', core, 'integral', 'status', '--json'], { encoding: 'utf8' });
  const descriptor = JSON.parse(inspection);
  if (descriptor.runtime_contract_version !== 1 || !descriptor.supported_runtime_presets?.includes('local') || descriptor.contract_version !== 1 || descriptor.default_harness_provider_id !== 'integral_native' || (!descriptor.supported_deployment_profiles?.includes('desktop_single_user') || descriptor.desktop_contract_version !== 1 || descriptor.desktop_assets_available !== true)) throw new Error('Core wheel lacks the desktop single-owner runtime contract or packaged resident skills.');
  fs.mkdirSync(base, { recursive: true });
  for (const entry of fs.readdirSync(base)) fs.rmSync(path.join(base, entry), { recursive: true, force: true });
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const file of [core]) fs.copyFileSync(file, path.join(base, path.basename(file)));
  const uvPath = path.join(base, process.platform === 'win32' ? 'uv.exe' : 'uv');
  fs.copyFileSync(uv, uvPath); fs.chmodSync(uvPath, 0o755);
  fs.writeFileSync(path.join(base, 'runtime.json'), JSON.stringify({
    contract_version: 1, runtime_contract_version: 1, runtime_preset: 'local', coreWheel: path.basename(core), harness_provider_id: 'integral_native', deployment_profile: 'desktop_single_user',
    platform: process.platform, arch: process.arch,
    sha256: { [path.basename(core)]: hash(core), uv: hash(uv) },
  }, null, 2) + '\n');
  console.log('Bundled the reviewed Core wheel and platform uv launcher.');
}

module.exports = { bundleRuntime };
