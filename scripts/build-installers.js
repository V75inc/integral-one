'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
process.chdir(root);
const signed = process.argv.includes('--signed');
// The checked-in config.json stays unconfigured. Installer builds use the
// public production account file unless a build already chose another one.
if (!process.env.INTEGRAL_ACCOUNT_CONFIG) {
  process.env.INTEGRAL_ACCOUNT_CONFIG = path.join(root, 'desktop/accounts/config.production.json');
}
const preparationEnv = require('./signing-config').releasePreparationEnv(process.env);
if (process.argv.slice(2).some(arg => arg !== '--signed')) throw new Error('Usage: npm run build:installers [-- --signed]');
if (!['darwin', 'win32'].includes(process.platform) || !['arm64', 'x64'].includes(process.arch) || (process.platform === 'win32' && process.arch !== 'x64')) throw new Error('Installer targets are macOS arm64/x64 and Windows x64. Build on the matching native runner.');
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run through npm run build:installers.');
if (signed) {
  if (process.platform === 'darwin' && process.arch !== 'arm64') throw new Error('Signed Mac release currently supports Apple Silicon on macOS 14+; Intel is blocked by Core runtime dependency compatibility.');
  if (process.platform === 'win32') throw new Error('Windows signed release remains blocked until its signing and automatic-update path are qualified. The initial signed release targets macOS.');
  const { version } = require('../package.json');
  const pins = require('../distribution.json');
  if (!/^\d+\.\d+\.\d+$/.test(version) || pins.product_version !== version) throw new Error('Signed public installers require matching stable package/distribution versions.');
  const { validateConfig } = require('../desktop/accounts/config');
  const config = validateConfig(JSON.parse(fs.readFileSync(process.env.INTEGRAL_ACCOUNT_CONFIG || path.join(root, 'desktop/accounts/config.json'), 'utf8')));
  if (!config.configured || config.environment !== 'production') throw new Error('Signed public installers require configured production accounts.');
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') throw new Error('Signing discovery must not be disabled for a signed release.');
  if (process.platform === 'darwin') require('./signing-config').validateMacNotarization();
  if (process.platform === 'win32' && !/^[A-Fa-f0-9]{40}$/.test(process.env.ONE_WINDOWS_CERT_SHA1 || '')) throw new Error('Set ONE_WINDOWS_CERT_SHA1 to the approved Windows certificate-store thumbprint. Configure the hardware/cloud signing provider first; see docs/WINDOWS-SIGNING.md.');
}
if (signed) execFileSync(process.execPath, [npm, 'run', 'qualify:ui:dependencies'], { stdio: 'inherit', env: preparationEnv });
for (const name of ['build:accounts', 'build:runtime']) execFileSync(process.execPath, [npm, 'run', name], { stdio: 'inherit', env: preparationEnv });
if (signed) {
  // Runtime qualification must not inherit signing or account-service secrets.
  execFileSync(process.execPath, [path.join(__dirname, 'qualify-upgrade.js'), path.join(root, 'resources/core'), '--require-settings'], { stdio: 'inherit', env: preparationEnv });
}
const builder = require.resolve('electron-builder/cli.js');
const args = [builder, process.platform === 'darwin' ? '--mac' : '--win', process.platform === 'darwin' ? 'zip' : 'nsis', `--${process.arch}`, '--publish', 'never'];
if (signed) {
  args.push('--config.forceCodeSigning=true');
  if (process.platform === 'darwin') args.push('--config.mac.notarize=true', '--config.extraMetadata.integralOneUpdates.enabled=true');
  else args.push(`--config.win.signtoolOptions.certificateSha1=${process.env.ONE_WINDOWS_CERT_SHA1}`);
}
if (!signed && process.platform === 'win32') args.push('--config.win.signExecutable=false');
execFileSync(process.execPath, args, { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(__dirname, 'inspect-package.js')], { stdio: 'inherit', env: preparationEnv });
console.log(signed ? 'Signed candidate built. Verify it and create the installer manifest before publication.' : 'Development installer built. It cannot pass the public bootstrap signature/release gates.');
