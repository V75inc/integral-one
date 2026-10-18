'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPermissions } = require('../lib/permissions');

function fixture(t, { platform = 'darwin', status = 'not-determined', choice = 0, osAllowed = true, saved } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'integral-permissions-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const consentPath = path.join(dir, 'consent.json');
  if (saved) fs.writeFileSync(consentPath, saved);
  let workspace = 'http://127.0.0.1:9006', url = `${workspace}/settings`, closed = false;
  let mediaStatus = status, askCalls = 0, check, request;
  const messages = [], external = [];
  const contents = { getURL: () => url, isDestroyed: () => closed };
  const owner = { webContents: contents, isDestroyed: () => closed };
  const options = {
    platform, consentPath, getWindow: () => owner, getWorkspace: () => workspace,
    session: { setPermissionCheckHandler: cb => { check = cb; }, setPermissionRequestHandler: cb => { request = cb; } },
    systemPreferences: { getMediaAccessStatus: () => mediaStatus, askForMediaAccess: async type => {
      assert.equal(type, 'microphone'); askCalls++; mediaStatus = osAllowed ? 'granted' : 'denied'; return osAllowed;
    } },
    dialog: { showMessageBox: async (_owner, message) => { messages.push(message); return { response: choice }; } },
    shell: { openExternal: async target => external.push(target) },
  };
  const manager = createPermissions(options);
  const details = (overrides = {}) => ({ isMainFrame: true, requestingUrl: url, securityOrigin: workspace, mediaTypes: ['audio'], mediaType: 'audio', ...overrides });
  return { manager, options, contents, messages, external, consentPath,
    check: (permission = 'media', override = {}) => check(contents, permission, workspace, details(override)),
    request: (permission = 'media', override = {}, source = contents) => new Promise(resolve => request(source, permission, resolve, details(override))),
    askCalls: () => askCalls, navigate: target => { url = target; }, close: () => { closed = true; },
    workspace: target => { workspace = target; url = `${target}/settings`; },
  };
}

test('first launch requests consent and OS access; later launches reuse it', async t => {
  const f = fixture(t);
  assert.equal(f.check(), false);
  assert.equal(await f.manager.setup(), true);
  assert.equal(f.askCalls(), 1);
  assert.equal(f.messages[0].title, 'Set up voice input');
  assert.equal(f.check(), true);
  assert.equal(await createPermissions(f.options).setup(), true);
  assert.equal(f.messages.length, 1);
  assert.equal(f.askCalls(), 1);
});
test('Not now persists until an explicit retry', async t => {
  const f = fixture(t, { choice: 1 });
  assert.equal(await f.manager.setup(), false);
  assert.equal(await f.manager.setup(), false);
  assert.equal(f.messages.length, 1);
  assert.equal(f.askCalls(), 0);
  assert.equal(f.check(), false);
  assert.equal(await f.request(), false);
  assert.equal(f.messages.length, 2);
});
test('OS denial offers settings, does not nag on boot and never grants access', async t => {
  const f = fixture(t, { osAllowed: false });
  assert.equal(await f.manager.setup(), false);
  assert.equal(f.check(), false);
  assert.equal(f.messages[1].title, 'Microphone access is blocked');
  assert.match(f.external[0], /Privacy_Microphone/);
  assert.equal(await f.manager.setup(), false);
  assert.equal(f.messages.length, 2);
  assert.equal(await f.manager.setup({ force: true }), false);
  assert.equal(f.askCalls(), 1);
});
test('only the exact top-level workspace window may request audio', async t => {
  const f = fixture(t, { status: 'granted' });
  for (const detail of [
    { isMainFrame: false }, { requestingUrl: 'https://evil.example' }, { securityOrigin: 'https://evil.example' },
    { mediaTypes: ['video'] }, { mediaTypes: ['audio', 'video'] }, { mediaTypes: [] }, { mediaTypes: undefined },
  ]) assert.equal(await f.request('media', detail), false);
  assert.equal(await f.request('media', {}, { ...f.contents }), false);
  for (const permission of ['notifications', 'geolocation', 'display-capture', 'clipboard-read', 'unknown']) {
    assert.equal(await f.request(permission), false);
    assert.equal(f.check(permission), false);
  }
  assert.equal(f.messages.length, 0);
  assert.equal(await f.request(), true);
  for (const detail of [{ mediaType: 'video' }, { mediaType: 'unknown' }, { isMainFrame: false }, { securityOrigin: 'https://evil.example' }]) {
    assert.equal(f.check('media', detail), false);
  }
});
test('copy buttons receive sanitized clipboard write only', async t => {
  const f = fixture(t);
  assert.equal(f.check('clipboard-sanitized-write'), true);
  assert.equal(await f.request('clipboard-sanitized-write'), true);
  assert.equal(f.check('clipboard-read'), false);
  assert.equal(f.check('clipboard-sanitized-write', { isMainFrame: false }), false);
  assert.equal(f.messages.length, 0);
});
test('concurrent requests share one consent and OS prompt', async t => {
  const f = fixture(t);
  assert.deepEqual(await Promise.all([f.request(), f.request()]), [true, true]);
  assert.equal(f.askCalls(), 1);
  assert.equal(f.messages.length, 1);
});
test('navigation during OS consent revokes the renderer request', async t => {
  const f = fixture(t);
  f.options.systemPreferences.askForMediaAccess = async () => { f.navigate('https://evil.example'); return true; };
  assert.equal(await f.request(), false);
});
test('workspace changes during setup do not grant the new origin', async t => {
  const f = fixture(t);
  f.options.dialog.showMessageBox = async () => { f.workspace('https://other.example'); return { response: 0 }; };
  assert.equal(await f.manager.setup(), false);
  assert.equal(f.check(), false);
  assert.equal(fs.existsSync(f.consentPath), false);
});
test('closed windows and OS prompt failures deny access', async t => {
  const f = fixture(t);
  f.options.systemPreferences.askForMediaAccess = async () => { throw new Error('unavailable'); };
  assert.equal(await f.request(), false);
  f.close();
  assert.equal(await f.request(), false);
});
test('invalid stored consent grants nothing and new workspace origins ask again', async t => {
  const f = fixture(t, { status: 'granted', saved: '{invalid' });
  assert.equal(f.check(), false);
  assert.equal(await f.manager.setup(), true);
  f.workspace('https://workspace.example');
  assert.equal(f.check(), false);
  assert.equal(await f.manager.setup(), true);
  assert.equal(f.messages.length, 2);
});
test('Windows denied access opens its microphone privacy settings', async t => {
  const f = fixture(t, { platform: 'win32', status: 'denied' });
  assert.equal(await f.manager.setup(), false);
  assert.equal(f.external[0], 'ms-settings:privacy-microphone');
  assert.equal(f.askCalls(), 0);
});
test('Linux requests desktop consent without calling macOS APIs', async t => {
  const f = fixture(t, { platform: 'linux' });
  assert.equal(await f.manager.setup(), true);
  assert.equal(f.check(), true);
  assert.equal(f.askCalls(), 0);
});
