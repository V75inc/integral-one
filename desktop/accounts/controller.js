"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { loadState, privateFile } = require("./receipt");
const {
  authorizationUrl,
  createAttempt,
  LINKED_ACCOUNT,
  saveLogtoSetup,
  verifyLogtoSetup,
} = require("./logto-setup");
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
function contentPolicy() {
  return "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";
}
function callbackUrl(raw) {
  try {
    const cleaned =
      typeof raw === "string" ? raw.trim().replace(/^["']|["']$/g, "") : raw;
    const url = new URL(cleaned);
    if (
      url.protocol !== "integral-one:" ||
      url.host !== "account" ||
      url.username ||
      url.password ||
      (url.pathname !== "/callback" && url.pathname !== "/callback/")
    )
      return null;
    return url;
  } catch {
    return null;
  }
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
  accountRoot = __dirname,
  request = fetch,
}) {
  const { app, BrowserWindow, session, ipcMain, shell } = electron;
  let accountSession = null;
  let window = null,
    resolveGate = null,
    rejectGate = null,
    state = null,
    home = null,
    existingData = false,
    stateError = false,
    receiptValid = false,
    attempt = null;
  const channels = [];
  // A callback is accepted only from open-url or a later second-instance.
  // The launch command line is ignored so a stale URL cannot exchange a code.
  function onOpenUrl(event, url) {
    if (!callbackUrl(url)) return;
    event?.preventDefault?.();
    void receiveCallback(url);
  }
  function onSecondInstance(_event, commandLine = []) {
    const raw = [...commandLine].reverse().find((item) => callbackUrl(item));
    if (raw) void receiveCallback(raw);
  }
  if (typeof app.setAsDefaultProtocolClient === "function")
    app.setAsDefaultProtocolClient("integral-one");
  app.on("open-url", onOpenUrl);
  app.on("second-instance", onSecondInstance);
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
    rejectGate = null;
    attempt = null;
    window?.close();
    resolve?.();
  }
  async function beginSignIn({ prompt } = {}) {
    if (!config.configured)
      throw new Error("Account service is not configured.");
    attempt = createAttempt();
    await shell.openExternal(
      authorizationUrl(config.appId, attempt, prompt ? { prompt } : {}),
    );
    return true;
  }
  async function receiveCallback(raw) {
    const url = callbackUrl(raw);
    if (!url || !attempt) return;
    if (url.searchParams.has("error")) {
      const message =
        url.searchParams.get("error_description") ||
        url.searchParams.get("error") ||
        "Sign-in was cancelled or encountered an error in your browser.";
      if (window && !window.isDestroyed())
        window.webContents?.send?.("integral-one:account-status", { message });
      return;
    }
    const code = url.searchParams.get("code");
    if (url.searchParams.get("state") !== attempt.state || !code) return;
    const proof = { code, attempt, appId: config.appId };
    attempt = null;
    try {
      await saveLogtoSetup(home, state, proof, request);
      state = loadState(home);
      complete();
    } catch (error) {
      if (window && !window.isDestroyed())
        window.webContents?.send?.("integral-one:account-status", {
          message:
            error?.message === LINKED_ACCOUNT
              ? LINKED_ACCOUNT
              : error?.message || "Sign-in exchange failed. Try again.",
        });
    }
  }
  handle("integral-one:activation-context", () => ({
    configured: config.configured,
    installationId: state.installationId,
    environment: config.environment || "development",
    setupMode: config.setupMode || "logto",
    existingData,
    stateError,
    returning: Boolean(state.receipt || state.localSetup),
    canContinueOffline: receiptValid,
    recoveryNeeded:
      stateError ||
      Boolean((state.receipt || state.localSetup) && !receiptValid),
  }));
  handle("integral-one:activation-recovery", () => {
    if (!existingData) throw new Error("No existing local installation.");
    // Explicit local recovery is not a receipt repair or a new account binding.
    state = { ...state, signedOut: false };
    complete();
    return true;
  });
  handle("integral-one:account-offline", () => {
    resumeOffline();
    complete();
    return true;
  });
  handle("integral-one:account-start", () => beginSignIn());
  handle("integral-one:account-restart", () =>
    beginSignIn({ prompt: "login" }),
  );
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
        verifyLogtoSetup(home, state);
        receiptValid = true;
        if (!forceSignIn && !state.signedOut) return;
      } catch {
        /* Preserve local data; offer recovery. A Clerk record is not converted. */
      }
    }
    if (!registered) {
      accountSession = session.fromPartition("integral-one-activation");
      accountSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      accountSession.setPermissionCheckHandler(() => false);
      accountSession.protocol.handle("integral-one", (protocolRequest) => {
        try {
          const file = asset(protocolRequest.url, path.join(accountRoot, "ui"));
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
              "Content-Security-Policy": contentPolicy(),
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
        ...(process.platform === "win32"
          ? {
              titleBarStyle: "hidden",
              titleBarOverlay: {
                color: "#171717",
                symbolColor: "#ededed",
                height: 32,
              },
              autoHideMenuBar: true,
            }
          : {}),
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
        attempt = null;
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
    if (!state?.localSetup) return null;
    try {
      return verifyLogtoSetup(home, state).profile || null;
    } catch {
      return null;
    }
  }
  function writeSignedOut(value) {
    state = { ...state, signedOut: value };
    privateFile(path.join(home, "one-account", "activation.json"), state);
  }
  function signOut() {
    writeSignedOut(true);
    attempt = null;
  }
  async function signIn() {
    if (resolveGate) throw new Error("Account sign-in is already open.");
    await accountSession?.clearStorageData();
    return beforeBoot({ userData: app.getPath("userData"), forceSignIn: true });
  }
  function resumeOffline() {
    verifyLogtoSetup(home, state);
    writeSignedOut(false);
  }
  function authorizeSession() {
    if (state?.signedOut)
      throw new Error(
        "Sign in or choose Continue offline to reopen this local workspace.",
      );
  }
  function cleanup() {
    resolveGate = null;
    rejectGate = null;
    attempt = null;
    app.removeListener("open-url", onOpenUrl);
    app.removeListener("second-instance", onSecondInstance);
    for (const channel of channels) ipcMain.removeHandler(channel);
    channels.length = 0;
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
