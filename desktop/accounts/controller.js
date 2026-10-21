"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { loadState, saveReceipt, privateFile } = require("./receipt");
const { verifyAccount, saveClerkSetup } = require("./clerk-setup");
const ACCOUNT_ORIGIN = "integral-one://account";
function isAccountUrl(raw) {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "integral-one:" &&
      u.host === "account" &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}
function trustedSender(event, window) {
  return Boolean(
    window &&
      !window.isDestroyed() &&
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame &&
      isAccountUrl(event.senderFrame.url),
  );
}
function asset(requestUrl, root) {
  const url = new URL(requestUrl);
  if (!isAccountUrl(requestUrl)) throw new Error("Unknown account origin.");
  const name = decodeURIComponent(url.pathname);
  // Deliberately a fixed allowlist, with no SPA/file fallback or arbitrary file read.
  const allowed = {
    "/": "index.html",
    "/index.html": "index.html",
    "/account.js": "account.js",
    "/account.css": "account.css",
    "/integral-logo.svg": "integral-logo.svg",
  };
  if (!Object.hasOwn(allowed, name)) throw new Error("Unknown account asset.");
  const file = path.join(root, allowed[name]);
  if (fs.lstatSync(file).isSymbolicLink())
    throw new Error("Account assets must not be symlinks.");
  return file;
}
function contentPolicy(config) {
  const api = config.configured ? config.clerkIssuer : "";
  return `default-src 'none'; script-src 'self' ${api} https://challenges.cloudflare.com https://*.protect.clerk.com; connect-src 'self' ${api} https://*.protect.clerk.com; style-src 'self' 'unsafe-inline'; img-src 'self' https://img.clerk.com data:; font-src 'self' data:; frame-src https://challenges.cloudflare.com https://*.protect.clerk.com; worker-src 'self' blob:; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'`;
}
async function requestReceipt(token, installationId, config, request = fetch) {
  if (typeof token !== "string" || token.length < 20 || token.length > 16000)
    throw new Error("Sign in before activation.");
  const response = await request(
    `${config.activationUrl}/v1/one/registrations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ installationId }),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new Error("The activation service could not verify this account.");
  const text = await response.text();
  if (text.length > 16000) throw new Error("Invalid activation response.");
  const result = JSON.parse(text);
  if (typeof result.receipt !== "string")
    throw new Error("Invalid activation response.");
  return result.receipt;
}
function createController({
  electron,
  config,
  createBridge,
  accountRoot = __dirname,
  request = fetch,
}) {
  const { app, BrowserWindow, session, ipcMain, clipboard } = electron;
  let accountSession = null;
  let window = null,
    resolveGate = null,
    rejectGate = null,
    state = null,
    home = null,
    existingData = false,
    stateError = false,
    receiptValid = false;
  const memory = new Map();
  // No refresh/session tokens need survive first activation. Avoid a second
  // credential store or dependence on the platform keychain for local access.
  const bridge = createBridge({
    manageSingleInstanceLock: false,
    renderer: { scheme: "integral-one", host: "account" },
    storage: {
      getItem: (key) => memory.get(key) || null,
      setItem: (key, value) => {
        if (
          typeof key !== "string" ||
          key.length > 100 ||
          typeof value !== "string" ||
          value.length > 20000
        )
          throw new Error("Invalid account token cache entry.");
        memory.set(key, value);
      },
      removeItem: (key) => {
        memory.delete(key);
      },
    },
  });
  const channels = [];
  function handle(channel, callback) {
    channels.push(channel);
    ipcMain.handle(channel, async (event, ...args) => {
      if (!trustedSender(event, window))
        throw new Error("Untrusted account caller.");
      return callback(...args);
    });
  }
  function complete() {
    const resolve = resolveGate;
    resolveGate = null;
    memory.clear();
    window?.close();
    resolve?.();
  }
  handle("integral-one:activation-context", () => ({
    configured: config.configured,
    publishableKey: config.publishableKey,
    installationId: state.installationId,
    portal: config.activationUrl || null,
    environment: config.environment || "development",
    offlineImport: Boolean(
      config.activationUrl && Object.keys(config.publicKeys || {}).length,
    ),
    setupMode: config.setupMode || "service",
    existingData,
    stateError,
    returning: Boolean(state.receipt || state.localSetup),
    canContinueOffline: receiptValid,
    recoveryNeeded:
      stateError ||
      Boolean((state.receipt || state.localSetup) && !receiptValid),
  }));
  handle("integral-one:activation-copy", () => {
    if (stateError) throw new Error("Activation identity needs recovery.");
    clipboard.writeText(state.installationId);
    return true;
  });
  handle("integral-one:activation-import", (code) => {
    if (stateError) throw new Error("Activation identity needs recovery.");
    saveReceipt(home, state, code, config);
    state = loadState(home);
    complete();
    return true;
  });
  handle("integral-one:activate", async (token) => {
    if (stateError) throw new Error("Activation identity needs recovery.");
    if (!config.configured)
      throw new Error("Account service is not configured.");
    if (config.setupMode === "clerk") {
      await saveClerkSetup(home, state, token, config, request);
    } else {
      const code = await requestReceipt(
        token,
        state.installationId,
        config,
        request,
      );
      saveReceipt(home, state, code, config);
    }
    state = loadState(home);
    complete();
    return true;
  });
  handle("integral-one:activation-recovery", () => {
    if (!existingData) throw new Error("No existing local installation.");
    // Explicit local recovery is not a receipt repair or a new account binding.
    // Preserve the damaged file and permit this process to open existing data.
    state = { ...state, signedOut: false };
    complete();
    return true;
  });
  handle("integral-one:account-offline", () => {
    resumeOffline();
    complete();
    return true;
  });
  handle("integral-one:account-restart", () => {
    // The pinned SDK has no per-flow cancel API. Restarting the app tears down
    // its pending OAuth callback and starts a clean bridge without bypassing it.
    resolveGate = null;
    rejectGate = null;
    app.relaunch();
    app.quit();
    return true;
  });
  let registered = false;
  async function beforeBoot({ userData, forceSignIn = false }) {
    const homeFlag = process.argv
      .find((arg) => arg.startsWith("--home="))
      ?.slice(7);
    home = homeFlag || process.env.INTEGRAL_HOME || path.join(userData, "core");
    existingData = fs.existsSync(path.join(home, "installation.json"));
    stateError = false;
    receiptValid = false;
    try {
      state = loadState(home);
    } catch {
      // Never overwrite corrupt activation state or strand existing local data.
      stateError = true;
      state = { installationId: null };
    }
    if (state.receipt || state.localSetup) {
      try {
        verifyAccount(home, state, config);
        receiptValid = true;
        if (!forceSignIn && !state.signedOut) return;
      } catch {
        /* Preserve local data and receipt; offer reactivation/recovery. */
      }
    }
    if (!registered) {
      accountSession = session.fromPartition("integral-one-activation");
      accountSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      accountSession.setPermissionCheckHandler(() => false);
      accountSession.protocol.handle("integral-one", (request) => {
        try {
          const file = asset(request.url, path.join(accountRoot, "ui"));
          const type = file.endsWith(".js")
            ? "text/javascript"
            : file.endsWith(".css")
              ? "text/css"
              : file.endsWith(".svg")
                ? "image/svg+xml"
                : "text/html";
          return new Response(fs.readFileSync(file), {
            headers: {
              "Content-Type": `${type}; charset=utf-8`,
              "Content-Security-Policy": contentPolicy(config),
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      });
      registered = true;
    }
    return new Promise((resolve, reject) => {
      resolveGate = resolve;
      rejectGate = reject;
      window = new BrowserWindow({
        width: 560,
        height: 760,
        minWidth: 360,
        minHeight: 560,
        title: "Integral Account",
        backgroundColor: "#171717",
        webPreferences: {
          preload: path.join(accountRoot, "preload.js"),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          partition: "integral-one-activation",
        },
      });
      const block = (event, url) => {
        if (!isAccountUrl(url)) event.preventDefault();
      };
      window.webContents.on("will-navigate", block);
      window.webContents.on("will-redirect", (event, url) => block(event, url));
      window.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.on("closed", () => {
        window = null;
        memory.clear();
        if (resolveGate) {
          const reject = rejectGate;
          resolveGate = null;
          rejectGate = null;
          if (forceSignIn)
            reject?.(
              new Error("Sign-in was cancelled. Your local data is unchanged."),
            );
          else app.quit();
        }
      });
      window
        .loadURL(ACCOUNT_ORIGIN + "/")
        .catch(() => reject(new Error("Account setup could not load.")));
    });
  }
  function accountProfile() {
    if (!state?.receipt && !state?.localSetup) return null;
    try {
      return verifyAccount(home, state, config).profile || null;
    } catch {
      // Recovery can open local data without trusting a damaged account profile.
      return null;
    }
  }
  function writeSignedOut(value) {
    state = { ...state, signedOut: value };
    privateFile(path.join(home, "one-account", "activation.json"), state);
  }
  function signOut() {
    writeSignedOut(true);
    memory.clear();
  }
  async function signIn() {
    if (resolveGate) throw new Error("Account sign-in is already open.");
    await accountSession?.clearStorageData();
    return beforeBoot({ userData: app.getPath("userData"), forceSignIn: true });
  }
  function resumeOffline() {
    verifyAccount(home, state, config);
    writeSignedOut(false);
  }
  function authorizeSession() {
    if (state?.signedOut)
      throw new Error(
        "Sign in or choose Continue offline to reopen this local workspace.",
      );
  }
  function cleanup() {
    // Quitting an unfinished signup is normal, not a failed Core boot.
    resolveGate = null;
    rejectGate = null;
    bridge.cleanup();
    memory.clear();
    for (const channel of channels) ipcMain.removeHandler(channel);
  }
  app.on("before-quit", cleanup);
  return {
    beforeBoot,
    cleanup,
    accountProfile,
    signOut,
    signIn,
    resumeOffline,
    authorizeSession,
  };
}
module.exports = {
  ACCOUNT_ORIGIN,
  isAccountUrl,
  trustedSender,
  asset,
  contentPolicy,
  requestReceipt,
  createController,
};
