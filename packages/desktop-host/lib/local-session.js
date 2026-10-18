'use strict';
const fs = require('node:fs');
const path = require('node:path');

async function localSession(runtime, { readFile = fs.readFileSync, request = fetch } = {}) {
  const origin = new URL(runtime.web_url);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid desktop session origin.');
  }
  const record = JSON.parse(readFile(path.join(runtime.home, 'installation.json'), 'utf8'));
  if (record.installation_id !== runtime.installation_id || record.deployment_profile !== 'desktop_single_user' || !/^[a-f0-9]{64}$/.test(record.control_token || '')) {
    throw new Error('The local installation identity needs recovery.');
  }
  const response = await request(new URL('/api/auth/local-session', origin), {
    method: 'POST', headers: { Authorization: `Bearer ${record.control_token}` },
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('The local owner session could not be opened. Restart Integral or restore a verified backup.');
  const result = await response.json();
  if (typeof result.access_token !== 'string' || !result.access_token) throw new Error('Core returned an invalid owner session.');
  return result;
}

function trustedSender(event, window, workspace) {
  return Boolean(window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame &&
    new URL(event.senderFrame.url).origin === new URL(workspace).origin);
}

module.exports = { localSession, trustedSender };
