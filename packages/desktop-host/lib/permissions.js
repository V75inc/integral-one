'use strict';
const fs = require('node:fs');
const path = require('node:path');

function origin(url) {
  try { return new URL(url).origin; } catch { return null; }
}

function createPermissions({ session, systemPreferences, dialog, shell, consentPath,
                             getWindow, getWorkspace, platform = process.platform }) {
  let grants = {};
  let pending = null;
  try {
    const saved = JSON.parse(fs.readFileSync(consentPath, 'utf8'));
    if (saved.version === 1 && saved.microphone && typeof saved.microphone === 'object') {
      grants = Object.fromEntries(Object.entries(saved.microphone).filter(([, value]) => typeof value === 'boolean'));
    }
  } catch { /* Missing or invalid consent never grants access. */ }

  const workspaceOrigin = () => origin(getWorkspace());
  const consented = () => grants[workspaceOrigin()] === true;
  const osStatus = () => ['darwin', 'win32'].includes(platform)
    ? systemPreferences.getMediaAccessStatus('microphone') : 'granted';
  const trusted = (contents, details = {}, requestingOrigin) => {
    const owner = getWindow();
    const expected = workspaceOrigin();
    return !!owner && !owner.isDestroyed() && contents === owner.webContents &&
      !contents.isDestroyed() && !!expected && details.isMainFrame === true &&
      origin(contents.getURL()) === expected && origin(details.requestingUrl) === expected &&
      (!requestingOrigin || origin(requestingOrigin) === expected) &&
      (!details.securityOrigin || origin(details.securityOrigin) === expected);
  };
  const remember = value => {
    grants[workspaceOrigin()] = value;
    fs.mkdirSync(path.dirname(consentPath), { recursive: true, mode: 0o700 });
    const temporary = `${consentPath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, microphone: grants }), { mode: 0o600 });
    fs.renameSync(temporary, consentPath);
  };
  const message = options => dialog.showMessageBox(getWindow(), options);

  async function explainBlocked() {
    const settings = platform === 'darwin'
      ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
      : platform === 'win32' ? 'ms-settings:privacy-microphone' : null;
    const { response } = await message({
      type: 'warning', title: 'Microphone access is blocked',
      message: 'Allow Integral to use your microphone in system settings.',
      detail: 'Enable microphone access, then quit and reopen Integral. You can continue working without dictation.',
      buttons: settings ? ['Open System Settings', 'Not now'] : ['OK'],
      defaultId: 0, cancelId: settings ? 1 : 0,
    });
    if (settings && response === 0) await shell.openExternal(settings);
    return false;
  }

  async function enableMicrophone() {
    if (!workspaceOrigin() || !getWindow() || getWindow().isDestroyed()) return false;
    const key = workspaceOrigin();
    const owner = getWindow();
    const current = () => workspaceOrigin() === key && getWindow() === owner && !owner.isDestroyed();
    if (!consented()) {
      const { response } = await message({
        type: 'question', title: 'Set up voice input',
        message: 'Enable your microphone for dictation?',
        detail: 'Integral uses the microphone when you start dictation or a microphone test. Speech is handled by your selected voice-input provider. You can enable this later from File → Microphone Access.',
        buttons: ['Enable microphone', 'Not now'], defaultId: 0, cancelId: 1,
      });
      if (!current()) return false;
      remember(response === 0);
      if (response !== 0) return false;
    }
    let status = osStatus();
    if (platform === 'darwin' && status === 'not-determined') {
      const allowed = await systemPreferences.askForMediaAccess('microphone');
      if (!current()) return false;
      if (allowed) return true;
      status = osStatus();
    }
    if (status === 'granted') return current();
    return explainBlocked();
  }

  function requestMicrophone() {
    if (!pending) pending = enableMicrophone().finally(() => { pending = null; });
    return pending;
  }

  session.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
    if (!trusted(contents, details, requestingOrigin)) return false;
    // Copy buttons need write access, never clipboard read access.
    if (permission === 'clipboard-sanitized-write') return true;
    return permission === 'media' && details.mediaType === 'audio' && consented() && osStatus() === 'granted';
  });
  session.setPermissionRequestHandler((contents, permission, callback, details = {}) => {
    if (!trusted(contents, details)) return callback(false);
    if (permission === 'clipboard-sanitized-write') return callback(true);
    if (permission !== 'media' || !Array.isArray(details.mediaTypes) ||
        !details.mediaTypes.length || details.mediaTypes.some(type => type !== 'audio')) return callback(false);
    // Revalidate after the asynchronous OS prompt: navigation/closure revokes the request.
    void requestMicrophone().then(allowed => callback(allowed && trusted(contents, details)))
      .catch(() => callback(false));
  });

  return {
    async setup({ force = false } = {}) {
      const key = workspaceOrigin();
      if (!key) return false;
      if (!force && Object.hasOwn(grants, key)) {
        if (consented() && osStatus() === 'not-determined') return requestMicrophone();
        return consented() && osStatus() === 'granted';
      }
      const allowed = await requestMicrophone();
      if (force && allowed) await message({
        type: 'info', title: 'Microphone access', message: 'Your microphone is ready.',
        detail: 'Start dictation in the chat, or test your microphone in Settings → Voice input.', buttons: ['OK'],
      });
      return allowed;
    },
  };
}

module.exports = { createPermissions };
