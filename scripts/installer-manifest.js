'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const run = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function validatePart(part) {
  if (part.schemaVersion !== 1 || !/^\d+\.\d+\.\d+$/.test(part.version)) throw new Error('Only stable release manifests are supported.');
  const entries = Object.entries(part.artifacts || {});
  if (!entries.length) throw new Error('Manifest has no installers.');
  const names = { 'darwin-arm64': `integral-one-${part.version}-mac-arm64.zip`, 'darwin-x64': `integral-one-${part.version}-mac-x64.zip`, 'win32-x64': `integral-one-${part.version}-win-x64.exe` };
  for (const [platform, asset] of entries) {
    if (!names[platform] || asset.file !== names[platform] || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1) throw new Error('Invalid installer identity/checksum/size.');
    if (platform.startsWith('darwin') ? !/^[A-Z0-9]{10}$/.test(asset.appleTeamId) : !/^[A-F0-9]{40}$/.test(asset.signerThumbprint)) throw new Error('Missing verified publisher identity.');
  }
  return part;
}
function createPart() {
  const { version } = require('../package.json');
  if (require('../distribution.json').product_version !== version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Package/distribution stable versions must agree.');
  const { validateConfig } = require('../desktop/accounts/config');
  const config = validateConfig(JSON.parse(fs.readFileSync(path.join(root, 'desktop/accounts/config.runtime.json'), 'utf8')));
  if (!config.configured || config.environment !== 'production') throw new Error('Production account configuration is required.');
  const platform = `${process.platform}-${process.arch}`;
  const file = process.platform === 'darwin' ? `integral-one-${version}-mac-${process.arch}.zip` : `integral-one-${version}-win-${process.arch}.exe`;
  const target = path.join(root, 'release', file);
  const asset = { file, sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'), bytes: fs.statSync(target).size };
  if (process.platform === 'darwin') {
    // Verify the exact ZIP's contents, not a possibly different adjacent bundle.
    const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'one-release-'));
    try {
      execFileSync('/usr/bin/ditto', ['-x', '-k', target, temp]);
      const app = path.join(temp, 'Integral One.app');
      execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
      execFileSync('/usr/sbin/spctl', ['--assess', '--type', 'execute', app]);
      // codesign writes identity details to stderr; read via a separate spawn.
      const signature = require('node:child_process').spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', app], { encoding: 'utf8' });
      if (signature.status !== 0) throw new Error('Cannot read publisher identity.');
      asset.appleTeamId = signature.stderr.match(/^TeamIdentifier=([A-Z0-9]{10})$/m)?.[1];
      if (run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', `${app}/Contents/Info.plist`]) !== 'ai.integral.desktop' || run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', `${app}/Contents/Info.plist`]) !== version) throw new Error('Packaged app identity/version mismatch.');
      inspectPackagedAccount(path.join(app, 'Contents/Resources/app.asar'), config);
      const packaged = JSON.parse(require('@electron/asar').extractFile(path.join(app, 'Contents/Resources/app.asar'), 'package.json').toString());
      if (packaged.integralOneUpdates?.enabled !== true) throw new Error('Official Mac installers must include the qualified updater.');
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  } else if (process.platform === 'win32' && process.arch === 'x64') {
    if (!/^[A-Fa-f0-9]{40}$/.test(process.env.ONE_WINDOWS_CERT_SHA1 || '')) throw new Error('Approved ONE_WINDOWS_CERT_SHA1 is required for the Windows release manifest.');
    const command = [
      "$ErrorActionPreference='Stop'",
      "foreach($file in @($env:ONE_SIGNED_INSTALLER,$env:ONE_SIGNED_APP)){ $s=Get-AuthenticodeSignature -LiteralPath $file; if($s.Status -ne 'Valid' -or $s.SignerCertificate.Thumbprint -ine $env:ONE_WINDOWS_CERT_SHA1 -or !$s.TimeStamperCertificate){throw 'Invalid, unexpected or untimestamped Windows publisher signature'}; if($s.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false) -cne 'V75 Inc.'){throw 'Expected V75 Inc. publisher'} }",
      "if((Get-Item -LiteralPath $env:ONE_SIGNED_APP).VersionInfo.ProductVersion -cne $env:ONE_RELEASE_VERSION){throw 'Packaged executable version mismatch'}",
      "$env:ONE_WINDOWS_CERT_SHA1",
    ].join('; ');
    asset.signerThumbprint = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { env: { ...process.env, ONE_SIGNED_INSTALLER: target, ONE_SIGNED_APP: path.join(root, 'release/win-unpacked/Integral One.exe'), ONE_RELEASE_VERSION: version }, encoding: 'utf8' }).trim().toUpperCase();
    inspectPackagedAccount(path.join(root, 'release/win-unpacked/resources/app.asar'), config);
  } else throw new Error('Unsupported native release runner.');
  const part = validatePart({ schemaVersion: 1, version, artifacts: { [platform]: asset } });
  const output = path.join(root, `release/install-manifest-${platform}.json`);
  fs.writeFileSync(output, JSON.stringify(part, null, 2) + '\n');
  console.log(`Verified native installer and wrote ${path.basename(output)}.`);
}
function inspectPackagedAccount(archive, expected) {
  const asar = require('@electron/asar');
  const bundled = JSON.parse(asar.extractFile(archive, 'desktop/accounts/config.runtime.json').toString());
  if (JSON.stringify(bundled) !== JSON.stringify(expected)) throw new Error('Packaged account configuration differs from reviewed production configuration.');
}
function merge(directory, output) {
  const parts = fs.readdirSync(directory).filter(name => /^install-manifest-(darwin-(arm64|x64)|win32-x64)\.json$/.test(name));
  let result;
  for (const name of parts) {
    const part = validatePart(JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
    if (!result) result = { schemaVersion: 1, version: part.version, artifacts: {} };
    if (part.version !== result.version) throw new Error('Do not combine release versions.');
    for (const [platform, asset] of Object.entries(part.artifacts)) {
      if (result.artifacts[platform]) throw new Error('Duplicate platform.');
      const file = path.join(directory, asset.file);
      if (!fs.statSync(file).isFile() || fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size !== asset.bytes || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== asset.sha256) throw new Error('Installer bytes differ from the signed platform part.');
      result.artifacts[platform] = asset;
    }
  }
  if (!result || !result.artifacts['darwin-arm64'] || !result.artifacts['darwin-x64']) throw new Error('Require Apple Silicon and Intel Mac installers before creating the launch manifest. Windows is optional.');
  fs.writeFileSync(output, JSON.stringify(validatePart(result), null, 2) + '\n');
  console.log('Created install-manifest.json from the verified platform parts (macOS required; Windows optional).');
}
if (require.main === module) {
  if (process.argv[2] === 'merge' && process.argv.length === 5) merge(path.resolve(process.argv[3]), path.resolve(process.argv[4]));
  else if (process.argv.length === 2) createPart();
  else throw new Error('Usage: node scripts/installer-manifest.js [merge <artifact-directory> <output.json>]');
}
module.exports = { validatePart, merge };
