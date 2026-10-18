'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
process.chdir(root);
const flags = new Set(process.argv.slice(2));
function fail(message) { console.error(`\nSetup needs attention: ${message}`); process.exit(1); }
for (const flag of flags) if (!['--check', '--launch'].includes(flag)) fail(`Unknown option ${flag}. Use --check or --launch.`);
if (Number(process.versions.node.split('.')[0]) !== 24) fail('Use Node.js 24 LTS, then run npm run setup again.');
function run(file, args, label, capture = false) {
  const result = spawnSync(file, args, { cwd: root, env: process.env, shell: false, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (result.error || result.status !== 0) fail(`${label} failed${result.error ? `: ${result.error.message}` : '.'} See docs/TROUBLESHOOTING.md.`);
  return result.stdout?.trim();
}
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
run(python, ['-c', 'import sys; assert sys.version_info >= (3, 11), "Python 3.11 or newer is required"'], 'Python check');
process.env.PYTHON = python;
const uvName = process.platform === 'win32' ? 'uv.exe' : 'uv';
const uv = process.env.INTEGRAL_UV_BINARY || (process.env.PATH || '').split(path.delimiter).map(folder => path.join(folder, uvName)).find(file => fs.existsSync(file));
if (!uv) fail('Install uv from https://docs.astral.sh/uv/getting-started/installation/ or set INTEGRAL_UV_BINARY.');
run(uv, ['--version'], 'uv check', true);
process.env.INTEGRAL_UV_BINARY = path.resolve(uv);
const configPath = path.resolve(process.env.INTEGRAL_ACCOUNT_CONFIG || 'desktop/accounts/config.json');
let config;
try { config = require('../desktop/accounts/config').validateConfig(JSON.parse(fs.readFileSync(configPath, 'utf8'))); }
catch (error) { fail(`Account configuration: ${error.message}`); }
console.log('\nIntegral | one — source setup');
console.log('Prerequisites and public account configuration checked.');
if (!config.configured) console.log('Account signup is not configured in this source checkout. Builds work; first-use signup needs a maintainer-provided public config. See docs/DEVELOPMENT.md.');
if (flags.has('--check')) process.exit(0);
const npmCli = process.env.npm_execpath;
if (!npmCli || !fs.existsSync(npmCli)) fail('Run this script with npm run setup.');
for (const [label, args] of [
  ['Install locked dependencies', ['ci']],
  ['Build the workspace', ['run', 'qualify:ui']],
  ['Prepare the local runtime', ['run', 'build:runtime']],
  ['Build account screens', ['run', 'build:accounts']],
]) {
  console.log(`\n${label}…`);
  run(process.execPath, [npmCli, ...args], label);
}
console.log('\nSetup complete. Start with npm start. Your existing workspace has not been moved or reset.');
console.log('First launch needs internet for signup and runtime downloads; later local use works offline.');
if (flags.has('--launch')) run(process.execPath, [npmCli, 'start'], 'Desktop launch');
