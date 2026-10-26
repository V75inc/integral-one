"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { discoverUpdates, publicJson, RELEASES_API, verifyUpdateInfo } = require('../desktop/releases');
const { compareCore, validateManifest } = require('../desktop/release-contract');
const HASH = 'a'.repeat(64);
function fixture() {
  const wheel = version => [{ filename: `integral_core-${version}-py3-none-any.whl`, packagetype: 'bdist_wheel', size: 123, yanked: false, digests: { sha256: HASH } }];
  const metadata = { releases: { '0.1.1rc35': wheel('0.1.1rc35'), '0.1.1rc36': wheel('0.1.1rc36'), '0.1.1': wheel('0.1.1') } };
  const manifest = { schemaVersion: 2, version: '0.2.0', channel: 'development', core: { version: '0.1.1rc36', registry: 'testpypi', wheelSha256: HASH },
    artifacts: { 'darwin-arm64': { file: 'integral-one-0.2.0-mac-arm64.zip', bytes: 100, sha256: HASH, appleTeamId: 'M43V972XU9' } } };
  const releases = [{ tag_name: 'v0.2.0', draft: false, prerelease: true, assets: ['install-manifest.json', 'latest-mac.yml', 'integral-one-0.2.0-mac-arm64.zip'].map(name => ({ name })) }];
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/pypi/integral-core/json')) return Response.json(metadata);
    if (url === RELEASES_API) return Response.json(releases);
    if (url === 'https://github.com/V75inc/integral-one/releases/download/v0.2.0/install-manifest.json') return Response.json(manifest);
    throw new Error('Unexpected release request');
  };
  const run = extra => discoverUpdates({ currentCore: '0.1.1rc35', currentVersion: '0.1.0', channel: 'development', platform: 'darwin', arch: 'arm64', request, ...extra });
  return { metadata, manifest, releases, calls, request, run, wheel };
}
test('Core PEP 440 order distinguishes candidate numbers, final releases and patch versions', () => {
  assert.ok(compareCore('0.1.1rc35', '0.1.1rc9') > 0);
  assert.ok(compareCore('0.1.1', '0.1.1rc99') > 0);
  assert.ok(compareCore('0.1.2a1', '0.1.1') > 0);
  assert.throws(() => compareCore('0.1.1rc35/evil', '0.1.1'));
});
test('development discovery matches the exact TestPyPI hash to a complete One installer', async () => {
  const f = fixture(), result = await f.run();
  assert.equal(result.registry, 'testpypi');
  assert.equal(result.latestCore, '0.1.1');
  assert.equal(result.candidate.manifest.core.version, '0.1.1rc36');
  assert.equal(result.candidate.feedUrl, 'https://github.com/V75inc/integral-one/releases/download/v0.2.0/');
  assert.ok(f.calls[0].url.startsWith('https://test.pypi.org/'));
  for (const { options } of f.calls) {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'manual');
    assert.equal(Object.hasOwn(options.headers, 'Authorization'), false);
  }
});
test('stable discovery uses PyPI and excludes release candidates and GitHub prereleases', async () => {
  const f = fixture();
  f.manifest.channel = 'stable'; f.manifest.core.registry = 'pypi'; f.manifest.core.version = '0.1.1'; f.releases[0].prerelease = false;
  const result = await f.run({ channel: 'stable' });
  assert.equal(result.latestCore, '0.1.1');
  assert.equal(result.candidate.manifest.channel, 'stable');
  assert.ok(f.calls[0].url.startsWith('https://pypi.org/'));
  f.releases[0].prerelease = true;
  assert.equal((await f.run({ channel: 'stable' })).candidate, null);
});
test('a published Core without an installer is detected; draft, missing-platform and downgrade installers are excluded', async () => {
  for (const change of [f => { f.releases[0].draft = true; }, f => { delete f.manifest.artifacts['darwin-arm64']; f.manifest.artifacts['win32-x64'] = { file: 'integral-one-0.2.0-win-x64.exe', bytes: 100, sha256: HASH, signerThumbprint: 'A'.repeat(40), publisherName: 'V75 Inc.' }; }, f => { f.manifest.core.version = '0.1.1rc34'; }]) {
    const f = fixture(); change(f);
    const result = await f.run();
    assert.equal(result.candidate, null); assert.ok(result.latestCore);
  }
});
test('yanked wheels are excluded and a newer Core series is reported while its One installer is pending', async () => {
  const f = fixture();
  f.metadata.releases['0.1.1rc36'][0].yanked = true;
  f.metadata.releases['0.2.0'] = f.wheel('0.2.0');
  delete f.metadata.releases['0.1.1']; f.releases.length = 0;
  const result = await f.run();
  assert.equal(result.latestCore, '0.2.0'); assert.equal(result.candidate, null);
});
test('a wrong package hash, channel or publisher fails closed', async () => {
  for (const change of [f => { f.manifest.core.wheelSha256 = 'b'.repeat(64); }, f => { f.manifest.channel = 'stable'; }, f => { f.manifest.artifacts['darwin-arm64'].appleTeamId = 'OTHERTEAM1'; }]) {
    const f = fixture(); change(f); await assert.rejects(f.run());
  }
});
test('missing stable package metadata is a normal empty result', async () => {
  const f = fixture();
  const result = await f.run({ channel: 'stable', request: async () => new Response('', { status: 404 }) });
  assert.equal(result.latestCore, null); assert.equal(result.candidate, null);
});
test('metadata limits and redirect restrictions reject oversized or credential-bearing input', async () => {
  await assert.rejects(publicJson('https://pypi.org/pypi/integral-core/json', { limit: 8, request: async () => new Response('x'.repeat(9)) }), /limit/);
  await assert.rejects(publicJson('https://pypi.org/pypi/integral-core/json', { request: async () => new Response(null, { status: 302, headers: { location: 'https://evil.invalid' } }) }), /redirect/);
  await assert.rejects(publicJson('https://github.com/V75inc/integral-one/releases/download/v0.2.0/install-manifest.json', { asset: true, request: async () => new Response(null, { status: 302, headers: { location: 'https://evil.invalid' } }) }), /origin/);
  await assert.rejects(publicJson('https://secret@github.com/anything'), /origin/);
});
test('SDK update metadata must match the selected manifest and fixed artifact names', () => {
  const f = fixture(), candidate = { manifest: f.manifest, asset: f.manifest.artifacts['darwin-arm64'] };
  const info = { version: f.manifest.version, integralCore: { ...f.manifest.core }, releaseChannel: 'development', files: [{ url: candidate.asset.file, size: 100 }] };
  verifyUpdateInfo(info, candidate);
  info.files[0].url = 'https://evil.invalid/update.zip';
  assert.throws(() => verifyUpdateInfo(info, candidate));
  assert.throws(() => validateManifest({ ...f.manifest, schemaVersion: 1 }));
});
