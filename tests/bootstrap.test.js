'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
function fixture(t, channel = 'development') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'one-bootstrap-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const core = { version: channel === 'development' ? '0.1.1rc35' : '0.1.1', registry: channel === 'development' ? 'testpypi' : 'pypi', wheelSha256: 'a'.repeat(64) };
  const platform = process.platform === 'win32' ? 'win32-x64' : 'darwin-arm64';
  const manifest = { schemaVersion: 2, version: '0.1.5', channel, core, artifacts: { [platform]: {
    file: process.platform === 'win32' ? 'integral-one-0.1.5-win-x64.exe' : 'integral-one-0.1.5-mac-arm64.zip', bytes: 123, sha256: 'b'.repeat(64),
    ...(process.platform === 'win32' ? { signerThumbprint: 'A'.repeat(40), publisherName: 'V75 Inc.' } : { appleTeamId: 'M43V972XU9' }),
  } } };
  const publication = { urls: [{ filename: `integral_core-${core.version}-py3-none-any.whl`, yanked: false, digests: { sha256: core.wheelSha256 } }] };
  const releases = [{ tag_name: 'v0.1.5', draft: false, prerelease: channel === 'development', assets: [{ name: 'install-manifest.json' }, { name: manifest.artifacts[platform].file }] }];
  const save = () => { for (const [name, value] of Object.entries({ manifest, core: publication, releases })) fs.writeFileSync(path.join(root, `${name}.json`), JSON.stringify(value)); };
  save();
  function run() {
    if (process.platform === 'darwin') {
      const shim = path.join(root, 'curl');
      fs.writeFileSync(shim, `#!${process.execPath}\nconst fs=require('fs'),path=require('path'),a=process.argv.slice(2),u=a.find(x=>x.startsWith('https://')),out=a[a.indexOf('-o')+1];const name=u.includes('/pypi/integral-core/')?'core':u.includes('api.github.com')?'releases':u.endsWith('install-manifest.json')?'manifest':null;if(!name)throw Error('Installer download forbidden in check test');fs.copyFileSync(path.join(__dirname,name+'.json'),out);`, { mode: 0o755 });
      const source = fs.readFileSync(path.join(__dirname, '../install/install.sh'), 'utf8').replaceAll('/usr/bin/curl', `"${shim}"`);
      const script = path.join(root, 'install.sh'); fs.writeFileSync(script, source);
      return spawnSync('/bin/bash', [script, '--channel', channel, '--check'], { encoding: 'utf8', timeout: 30000 });
    }
    const quote = value => value.replaceAll("'", "''");
    let source = fs.readFileSync(path.join(__dirname, '../install/install.ps1'), 'utf8');
    const replacement = `\nfunction Receive-IntegralRelease([string]$Uri,[string]$OutFile) {\n  $name = if($Uri -like '*/pypi/integral-core/*'){'core'}elseif($Uri -like '*api.github.com*'){'releases'}elseif($Uri -like '*install-manifest.json'){'manifest'}else{throw 'Installer download forbidden in check test'}\n  Copy-Item -LiteralPath (Join-Path '${quote(root)}' ($name+'.json')) -Destination $OutFile\n}\nInstall-IntegralOne\n`;
    source = source.replace(/\nInstall-IntegralOne\s*$/, replacement);
    const script = path.join(root, 'install.ps1'); fs.writeFileSync(script, source);
    return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script, '-Channel', channel, '-Check'], { encoding: 'utf8', timeout: 30000 });
  }
  return { root, manifest, publication, releases, save, run };
}
const native = !['darwin', 'win32'].includes(process.platform) || (process.platform === 'darwin' && process.arch !== 'arm64');
test('native bootstrap check resolves stable and development metadata without downloading an application', { skip: native }, t => {
  for (const channel of ['stable', 'development']) {
    const f = fixture(t, channel), result = f.run();
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /with Core/); assert.match(result.stdout, /No files installed/);
  }
});
test('native bootstrap rejects channel mismatch, yanked Core and changed publication hash', { skip: native }, t => {
  for (const change of [f => { f.manifest.channel = 'stable'; }, f => { f.publication.urls[0].yanked = true; }, f => { f.publication.urls[0].digests.sha256 = 'c'.repeat(64); }, f => { f.releases[0].prerelease = false; }]) {
    const f = fixture(t); change(f); f.save(); const result = f.run();
    assert.notEqual(result.status, 0, result.stdout);
    assert.doesNotMatch(result.stdout, /No files installed/);
  }
});
