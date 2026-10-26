'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { localSession, trustedSender, createSessionHandler } = require('../lib/local-session');
const runtime = { home: '/private/installation', installation_id: 'd'.repeat(32), web_url: 'http://127.0.0.1:19006' };
const record = { installation_id: runtime.installation_id, deployment_profile: 'desktop_single_user', control_token: 'c'.repeat(64) };

test('native session binds the private installation to its local origin without exposing the controller secret', async () => {
  let call;
  const result = await localSession(runtime, { readFile: () => JSON.stringify(record), request: async (url, options) => { call = { url, options }; return { ok: true, json: async () => ({ access_token: 'short-session', expires_in: 60 }) }; } });
  assert.deepEqual(result, { access_token: 'short-session', expires_in: 60 });
  assert.equal(call.url.href, 'http://127.0.0.1:19006/api/auth/local-session');
  assert.equal(call.options.redirect, 'error');
  assert.equal(call.options.headers.Authorization, `Bearer ${record.control_token}`);
  assert.ok(!JSON.stringify(result).includes(record.control_token));
});

test('refuses remote and mismatched installations before making a request', async () => {
  for (const changed of [{ ...runtime, web_url: 'https://remote.test' }, { ...runtime, installation_id: 'other' }]) {
    await assert.rejects(localSession(changed, { readFile: () => JSON.stringify(record), request: async () => { throw new Error('must not fetch'); } }));
  }
});

test('session IPC excludes frames and other windows even at the same origin', () => {
  const mainFrame = { url: runtime.web_url };
  const webContents = { mainFrame };
  const window = { webContents };
  assert.equal(trustedSender({ sender: webContents, senderFrame: mainFrame }, window, runtime.web_url), true);
  assert.equal(trustedSender({ sender: webContents, senderFrame: { url: runtime.web_url } }, window, runtime.web_url), false);
  assert.equal(trustedSender({ sender: {}, senderFrame: mainFrame }, window, runtime.web_url), false);
  mainFrame.url = 'https://attacker.test';
  assert.equal(trustedSender({ sender: webContents, senderFrame: mainFrame }, window, runtime.web_url), false);
});


test('coalesces native renewals and rechecks sign-out after the exchange', async () => {
  let signedOut = false;
  let finish;
  let calls = 0;
  const handler = createSessionHandler({
    getRuntime: () => runtime, isTrusted: () => true,
    authorize: () => { if (signedOut) throw new Error('signed out'); },
    exchange: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
  });
  const first = handler({});
  const second = handler({});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  signedOut = true;
  finish({ access_token: 'late', expires_in: 60 });
  await Promise.all([assert.rejects(first, /signed out/), assert.rejects(second, /signed out/)]);
});

test('does not deliver a session to a navigated frame or changed runtime', async () => {
  for (const changed of ['frame', 'runtime']) {
    let current = runtime;
    let trusted = true;
    const handler = createSessionHandler({
      getRuntime: () => current, isTrusted: () => trusted,
      exchange: async () => {
        if (changed === 'frame') trusted = false;
        else current = { ...runtime };
        return { access_token: 'late', expires_in: 60 };
      },
    });
    await assert.rejects(handler({}), /changed/);
  }
});

test('a failed exchange does not poison later recovery', async () => {
  let calls = 0;
  const handler = createSessionHandler({
    getRuntime: () => runtime, isTrusted: () => true,
    exchange: async () => { if (++calls === 1) throw new Error('restarting'); return { access_token: 'fresh', expires_in: 60 }; },
  });
  await assert.rejects(handler({}), /restarting/);
  assert.equal((await handler({})).access_token, 'fresh');
});
