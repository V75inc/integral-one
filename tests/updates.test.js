"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { createUpdates } = require('../desktop/updates');
function fixture(t, options = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'one-updates-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const app = new EventEmitter(), updater = new EventEmitter(), calls = [], messages = [], answers = [];
  Object.assign(app, { isPackaged: true, getVersion: () => '0.1.0', getPath: () => home, relaunch: () => calls.push('relaunch'), quit: () => calls.push('quit') }, options.app);
  const data = Buffer.from('qualified test installer'), file = path.join(home, 'update.zip'); fs.writeFileSync(file, data);
  const manifest = { schemaVersion: 2, version: '0.2.0', channel: 'development', core: { version: '0.1.1rc36', registry: 'testpypi', wheelSha256: 'a'.repeat(64) }, artifacts: {} };
  const asset = { file: 'integral-one-0.2.0-mac-arm64.zip', bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex'), appleTeamId: 'M43V972XU9' };
  manifest.artifacts['darwin-arm64'] = asset;
  const result = { latestCore: '0.1.1rc36', registry: 'testpypi', candidate: { manifest, asset, feedUrl: 'https://github.com/V75inc/integral-one/releases/download/v0.2.0/' } };
  const info = () => ({ version: manifest.version, integralCore: { ...manifest.core }, releaseChannel: manifest.channel, files: [{ url: asset.file, size: asset.bytes }] });
  updater.setFeedURL = feed => { calls.push('feed'); assert.equal(feed.provider, 'generic'); assert.equal(feed.url, result.candidate.feedUrl); };
  updater.checkForUpdates = async () => { calls.push('check'); return { updateInfo: info() }; };
  updater.downloadUpdate = async () => { calls.push('download'); return [file]; };
  updater.quitAndInstall = () => calls.push('install');
  const prefs = path.join(home, 'one-updates.json');
  if (options.automatic !== undefined) fs.writeFileSync(prefs, JSON.stringify({ automaticChecks: options.automatic }));
  let tick;
  const control = createUpdates({ app, autoUpdater: updater, enabled: true, channel: 'development', currentCore: { version: '0.1.1rc35' }, platform: 'darwin', arch: 'arm64',
    discover: async () => { calls.push('discover'); return result; }, prepareForInstall: async () => calls.push('backup-stop'),
    dialog: { showMessageBox: async message => { messages.push(message); return { response: answers.shift() ?? 1 }; } },
    interval: fn => { tick = fn; return { unref() {} }; }, clear: () => calls.push('clear'), ...options.control });
  t.after(control.dispose);
  return { app, updater, calls, messages, answers, prefs, control, result, info, file, tick: () => tick?.() };
}
test('first launch checks automatically and declining leaves the installed app alone', async t => {
  const f = fixture(t); await f.control.start();
  assert.deepEqual(f.calls, ['discover', 'feed', 'check']);
  assert.equal(f.control.menuItems[1].checked, true);
  assert.equal(f.updater.autoDownload, false); assert.equal(f.updater.autoInstallOnAppQuit, false); assert.equal(f.updater.allowDowngrade, false);
  assert.equal(f.messages.length, 1);
  await f.control.check(false); assert.equal(f.messages.length, 1);
  await f.control.check(true); assert.equal(f.messages.length, 2);
});
test('download and restart need separate approvals; stop and backup precede installation', async t => {
  const f = fixture(t); f.answers.push(0, 1);
  await f.control.check();
  assert.deepEqual(f.calls, ['discover', 'feed', 'check', 'download']);
  f.app.emit('before-quit'); assert.equal(f.calls.includes('install'), false);
  f.answers.push(0); await f.control.check();
  assert.deepEqual(f.calls.slice(-2), ['backup-stop', 'install']);
});
test('failed backup or engine stop prevents install and offers recovery', async t => {
  const f = fixture(t, { control: { prepareForInstall: async () => { throw new Error('private runtime'); } } });
  f.answers.push(0, 0); await f.control.check();
  assert.equal(f.calls.includes('install'), false);
  assert.match(f.messages.at(-1).buttons[0], /Reopen/);
  assert.equal(JSON.stringify(f.messages).includes('private runtime'), false);
});
test('a tampered downloaded installer never reaches restart or install', async t => {
  const f = fixture(t); fs.appendFileSync(f.file, 'tampered'); f.answers.push(0);
  await f.control.check();
  assert.equal(f.calls.includes('backup-stop'), false); assert.equal(f.calls.includes('install'), false);
  assert.match(f.messages.at(-1).message, /could not/);
});
test('concurrent checks coalesce and a manual request receives background failure feedback', async t => {
  let finish; const f = fixture(t, { control: { discover: () => new Promise((_, reject) => { finish = reject; }) } });
  const first = f.control.check(false), second = f.control.check(true);
  assert.equal(first, second); finish(new Error('private HTTP body')); await first;
  assert.equal(f.messages.length, 1); assert.equal(JSON.stringify(f.messages).includes('private HTTP body'), false);
});
test('previews and unsupported platforms do not make update requests; Windows x64 is enabled', async t => {
  for (const options of [{ app: { isPackaged: false } }, { control: { enabled: false } }, { control: { platform: 'linux' } }, { control: { platform: 'darwin', arch: 'x64' } }]) {
    const f = fixture(t, options); await f.control.start(); await f.control.check();
    assert.deepEqual(f.calls, []); assert.match(f.messages[0].message, /unavailable/);
  }
  const f = fixture(t, { control: { platform: 'win32', arch: 'x64' } }); await f.control.check(); assert.ok(f.calls.includes('discover'));
});
test('a saved opt-out persists and manual checks still work', async t => {
  const f = fixture(t, { automatic: false }); await f.control.start(); assert.deepEqual(f.calls, []);
  assert.equal(f.control.menuItems[1].checked, false); await f.control.check(); assert.ok(f.calls.includes('check'));
  f.control.menuItems[1].click({ checked: false }); assert.equal(JSON.parse(fs.readFileSync(f.prefs)).automaticChecks, false);
});
test('published Core without a compatible installer is reported once automatically and on manual request', async t => {
  const f = fixture(t); f.result.candidate = null;
  await f.control.start(); await f.control.check(false); assert.equal(f.messages.length, 1);
  assert.match(f.messages[0].message, /Core 0.1.1rc36/); assert.match(f.messages[0].detail, /being prepared/);
  await f.control.check(true); assert.equal(f.messages.length, 2); assert.equal(f.calls.includes('download'), false);
});
test('background connection failures are quiet and no result is offered after disposal', async t => {
  const f = fixture(t, { control: { discover: async () => { throw new Error('private'); } } });
  await f.control.check(false); assert.equal(f.messages.length, 0);
  let resolve; const g = fixture(t, { control: { discover: () => new Promise(done => { resolve = done; }) } });
  const pending = g.control.check(); g.control.dispose(); resolve(g.result); await pending;
  assert.equal(g.messages.length, 0); assert.equal(g.calls.includes('check'), false);
});
test('native installation errors retain the installed app and offer to reopen it', async t => {
  const f = fixture(t); f.answers.push(0, 0); await f.control.check();
  f.updater.emit('error', new Error('private signature details')); await new Promise(resolve => setImmediate(resolve));
  assert.match(f.messages.at(-1).detail, /installed version/); assert.equal(JSON.stringify(f.messages).includes('private signature details'), false);
});
test('startup loads preferences only after the host establishes the stable data path', async t => {
  const item = { checked: false }, f = fixture(t, { automatic: false, control: { Menu: { getApplicationMenu: () => ({ getMenuItemById: () => item }) } } });
  const correct = f.app.getPath; f.app.getPath = () => '/not-the-host-data-path'; assert.equal(f.calls.length, 0);
  f.app.getPath = correct; await f.control.start(); assert.equal(item.checked, false); assert.deepEqual(f.calls, []);
});

test('automatic-check preferences refuse a dangling symlink without writing its target', { skip: process.platform === 'win32' }, async t => {
  const f = fixture(t), target = path.join(path.dirname(f.prefs), 'outside.json');
  fs.symlinkSync(target, f.prefs);
  const item = { checked: false }; f.control.menuItems[1].click(item);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(item.checked, true); assert.equal(fs.existsSync(target), false);
  assert.match(f.messages.at(-1).message, /could not/);
});
