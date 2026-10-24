"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  verifyReceipt,
  loadState,
  saveReceipt,
  readState,
} = require("../desktop/accounts/receipt");
const {
  isAccountUrl,
  trustedSender,
  asset,
  contentPolicy,
  requestReceipt,
  createController,
} = require("../desktop/accounts/controller");
function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "one-activation-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const keys = crypto.generateKeyPairSync("ed25519");
  const config = {
    contractVersion: 1,
    provider: "clerk",
    configured: true,
    environment: "production",
    publishableKey:
      "pk_live_" + Buffer.from("auth.example.com$").toString("base64"),
    clerkIssuer: "https://auth.example.com",
    activationUrl: "https://accounts.example.com",
    issuer: "https://accounts.example.com",
    publicKeys: {
      first: keys.publicKey.export({ type: "spki", format: "pem" }),
    },
  };
  const state = loadState(home);
  function sign(changes = {}, header = {}) {
    const h = Buffer.from(
      JSON.stringify({
        alg: "EdDSA",
        typ: "integral-one-activation+jwt",
        kid: "first",
        ...header,
      }),
    ).toString("base64url");
    const p = Buffer.from(
      JSON.stringify({
        v: 1,
        aud: "integral-one-local-activation",
        product: "integral-one",
        iss: config.issuer,
        clerk_issuer: config.clerkIssuer,
        sub: "user_test123",
        installation_id: state.installationId,
        activated_at: "2026-10-18T12:00:00.000Z",
        ...changes,
      }),
    ).toString("base64url");
    return `${h}.${p}.${crypto.sign(null, Buffer.from(`${h}.${p}`), keys.privateKey).toString("base64url")}`;
  }
  return { home, config, state, sign };
}
test("signed activation persists and validates with no token, network or expiry check", (t) => {
  const f = fixture(t),
    code = f.sign();
  saveReceipt(f.home, f.state, code, f.config);
  assert.equal(
    verifyReceipt(readState(f.home).receipt, {
      ...f.config,
      installationId: f.state.installationId,
    }).sub,
    "user_test123",
  );
  assert.equal(loadState(f.home).installationId, f.state.installationId);
  assert.ok(!JSON.stringify(readState(f.home)).includes("access_token"));
  if (process.platform !== "win32")
    assert.equal(
      fs.statSync(path.join(f.home, "one-account/activation.json")).mode &
        0o777,
      0o600,
    );
});
for (const changes of [
  { installation_id: crypto.randomUUID() },
  { iss: "https://foreign.example" },
  { clerk_issuer: "https://foreign.clerk.example" },
  { aud: "business" },
  { sub: "not-a-user" },
  { exp: 9999999999 },
  { product: "integral-business" },
  { activated_at: "bad" },
])
  test(`receipt rejects binding/claims: ${JSON.stringify(changes)}`, (t) => {
    const f = fixture(t);
    assert.throws(() =>
      saveReceipt(f.home, f.state, f.sign(changes), f.config),
    );
    assert.equal(readState(f.home).receipt, undefined);
  });
test("signature, algorithm and unknown key substitutions are rejected", (t) => {
  const f = fixture(t);
  const verify = (code) =>
    verifyReceipt(code, {
      ...f.config,
      installationId: f.state.installationId,
    });
  assert.throws(() => verify(f.sign({}, { alg: "none" })));
  assert.throws(() => verify(f.sign({}, { kid: "untrusted" })));
  const parts = f.sign().split(".");
  parts[2] = Buffer.alloc(64).toString("base64url");
  assert.throws(() => verify(parts.join(".")));
});
test("corrupt state and symlink need recovery without replacing existing bytes", (t) => {
  const f = fixture(t),
    file = path.join(f.home, "one-account/activation.json");
  fs.writeFileSync(file, "not json");
  assert.throws(() => loadState(f.home));
  assert.equal(fs.readFileSync(file, "utf8"), "not json");
  fs.unlinkSync(file);
  try {
    fs.symlinkSync(path.join(f.home, "outside"), file);
  } catch (e) {
    if (e.code === "EPERM") return t.skip("Symlinks unavailable");
    throw e;
  }
  assert.throws(() => loadState(f.home));
});
test("only the dedicated account top-level window may call activation IPC", () => {
  const window = {
    isDestroyed: () => false,
    webContents: { mainFrame: { url: "integral-one://account/" } },
  };
  const event = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  };
  assert.equal(trustedSender(event, window), true);
  assert.equal(
    trustedSender(
      { ...event, senderFrame: { url: "integral-one://account/" } },
      window,
    ),
    false,
  );
  assert.equal(trustedSender({ ...event, sender: {} }, window), false);
  window.webContents.mainFrame.url = "http://127.0.0.1:4000/";
  assert.equal(trustedSender(event, window), false);
  for (const url of [
    "https://account/",
    "integral-one://attacker/",
    "integral-one://user@account/",
    "not a url",
  ])
    assert.equal(isAccountUrl(url), false);
});
test("only fixed account assets are served; CSP does not weaken Core", (t) => {
  const f = fixture(t),
    root = path.join(__dirname, "../accounts");
  assert.equal(
    asset("integral-one://account/", root),
    path.join(root, "index.html"),
  );
  for (const url of [
    "integral-one://account/%2e%2e/config.json",
    "integral-one://account/config.json",
    "integral-one://evil/account.js",
  ])
    assert.throws(() => asset(url, root));
  const csp = contentPolicy(f.config);
  assert.ok(!csp.includes("'unsafe-eval'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(!csp.includes("http://127.0.0.1"));
  assert.equal(/clerk|logto|trueselph|cloudflare/i.test(csp), false);
  assert.throws(() =>
    asset("integral-one://account/callback?code=1&state=2", root),
  );
});
test("activation request sends only installation ID and bearer to a fixed endpoint, without redirects", async (t) => {
  const f = fixture(t);
  let captured;
  await requestReceipt(
    "test-token-at-least-twenty-bytes",
    f.state.installationId,
    f.config,
    async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        text: async () => JSON.stringify({ receipt: f.sign() }),
      };
    },
  );
  assert.equal(
    captured.url,
    "https://accounts.example.com/v1/one/registrations",
  );
  assert.deepEqual(JSON.parse(captured.options.body), {
    installationId: f.state.installationId,
  });
  assert.equal(captured.options.redirect, "error");
  await assert.rejects(
    requestReceipt(
      "test-token-at-least-twenty-bytes",
      f.state.installationId,
      f.config,
      async () => ({ ok: false }),
    ),
  );
});
test("a legacy receipt does not open the workspace or gain a Logto binding", async (t) => {
  const f = fixture(t);
  const code = f.sign();
  saveReceipt(f.home, f.state, code, f.config);
  const file = path.join(f.home, "one-account/activation.json");
  const original = fs.readFileSync(file);
  const { EventEmitter } = require("node:events");
  let windows = 0;
  const controller = createController({
    config: f.config,
    request: () => assert.fail("A legacy receipt must not contact the network"),
    electron: {
      app: new EventEmitter(),
      ipcMain: { handle() {}, removeHandler() {} },
      session: {
        fromPartition: () => ({
          setPermissionRequestHandler() {},
          setPermissionCheckHandler() {},
          protocol: { handle() {} },
        }),
      },
      BrowserWindow: class extends EventEmitter {
        constructor() {
          super();
          windows += 1;
          this.webContents = new EventEmitter();
          this.webContents.mainFrame = { url: "integral-one://account/" };
          this.webContents.setWindowOpenHandler = () => {};
        }
        isDestroyed() {
          return false;
        }
        async loadURL() {}
        close() {
          this.emit("closed");
        }
      },
    },
  });
  const previous = process.env.INTEGRAL_HOME;
  process.env.INTEGRAL_HOME = f.home;
  t.after(() => {
    controller.cleanup();
    if (previous === undefined) delete process.env.INTEGRAL_HOME;
    else process.env.INTEGRAL_HOME = previous;
  });
  void controller.beforeBoot({ userData: f.home });
  assert.equal(windows, 1);
  assert.equal(controller.accountProfile(), null);
  assert.equal(fs.readFileSync(file).equals(original), true);
  assert.equal(readState(f.home).receipt, code);
  assert.equal(readState(f.home).localSetup, undefined);
});
test("signup stays automatic and shows the Integral logo without an activation action", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../accounts/renderer.jsx"),
    "utf8",
  );
  assert.match(source, /src="\/integral-logo\.svg"/);
  assert.match(source, /Your files and records stay on this computer/);
  assert.match(source, /Privacy and your account/);
  assert.match(source, /support@v75inc\.com/);
  assert.doesNotMatch(source, /window\.integralActivation\.register|telemetry=\{false\}/);
  assert.ok(!/>Activate\b/.test(source));
});
test("damaged signed-out receipt offers local recovery without replacing state", async (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.home, "installation.json"), "{}");
  const file = path.join(f.home, "one-account/activation.json");
  fs.writeFileSync(file, JSON.stringify({ ...f.state, receipt: "damaged", signedOut: true }));
  const original = fs.readFileSync(file, "utf8");
  const { EventEmitter } = require("node:events");
  const app = new EventEmitter(), handlers = new Map();
  let win;
  const controller = createController({
    config: f.config,
    createBridge: () => ({ cleanup() {} }),
    electron: {
      app, clipboard: {},
      ipcMain: { handle: (n, fn) => handlers.set(n, fn), removeHandler: n => handlers.delete(n) },
      session: { fromPartition: () => ({ setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, protocol: { handle() {} } }) },
      BrowserWindow: class extends EventEmitter {
        constructor() {
          super(); win = this;
          this.webContents = new EventEmitter();
          this.webContents.mainFrame = { url: "integral-one://account/" };
          this.webContents.setWindowOpenHandler = () => {};
        }
        isDestroyed() { return false; }
        async loadURL() {}
        close() { this.emit("closed"); }
      },
    },
  });
  const previous = process.env.INTEGRAL_HOME;
  process.env.INTEGRAL_HOME = f.home;
  t.after(() => {
    controller.cleanup();
    if (previous === undefined) delete process.env.INTEGRAL_HOME;
    else process.env.INTEGRAL_HOME = previous;
  });
  const pending = controller.beforeBoot({ userData: f.home });
  const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  const context = await handlers.get("integral-one:activation-context")(event);
  assert.equal(context.recoveryNeeded, true);
  assert.equal(context.canContinueOffline, false);
  await handlers.get("integral-one:activation-recovery")(event);
  await pending;
  controller.authorizeSession();
  assert.equal(controller.accountProfile(), null);
  assert.equal(fs.readFileSync(file, "utf8"), original);
});
test("loading screen is self-contained, softly glowing and respects reduced motion", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../desktop/loading.html"),
    "utf8",
  );
  assert.match(html, /<svg/);
  assert.match(html, /drop-shadow/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /Opening your workspace/);
  assert.ok(!/<script/i.test(html));
  assert.match(html, /default-src 'none'/);
});

test("signed profile survives offline and another Clerk account cannot replace the owner", (t) => {
  const f = fixture(t);
  const code = f.sign({
    profile: { email: "person@example.com", name: "Person" },
  });
  saveReceipt(f.home, f.state, code, f.config);
  assert.deepEqual(
    verifyReceipt(code, { ...f.config, installationId: f.state.installationId })
      .profile,
    { email: "person@example.com", name: "Person" },
  );
  assert.throws(
    () => saveReceipt(f.home, f.state, f.sign({ sub: "user_other" }), f.config),
    /linked to this computer/,
  );
  assert.equal(readState(f.home).receipt, code);
  assert.throws(
    () =>
      saveReceipt(
        f.home,
        f.state,
        f.sign({ profile: { email: "bad", name: "" } }),
        f.config,
      ),
    /profile/,
  );
});

test("the local account page is a one-column gate and the preload starts the browser with no arguments", () => {
  const renderer = fs.readFileSync(
    path.join(__dirname, "../accounts/renderer.jsx"),
    "utf8",
  );
  const preload = fs.readFileSync(
    path.join(__dirname, "../desktop/accounts/preload-entry.js"),
    "utf8",
  );
  const css = fs.readFileSync(
    path.join(__dirname, "../accounts/account.css"),
    "utf8",
  );
  const windowSource = fs.readFileSync(
    path.join(__dirname, "../desktop/accounts/controller.js"),
    "utf8",
  );
  function sliceFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} is missing`);
    let depth = 0;
    for (let i = source.indexOf("{", start); i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    assert.fail(`${name} is unclosed`);
  }
  for (const source of [renderer, preload]) {
    assert.doesNotMatch(source, /@clerk\/|@logto\/|logto-js/);
  }
  assert.doesNotMatch(renderer, /\bClerk|from ["']\.\/appearance["']/);
  assert.match(preload, /invoke\("integral-one:account-start"\)/);
  assert.doesNotMatch(
    preload,
    /account-start"\s*,|integral-one:activate|activation-import|activation-copy/,
  );
  assert.equal(
    (renderer.match(/integralActivation\.start\(\)/g) || []).length,
    1,
  );
  const configured = sliceFunction(renderer, "ConfiguredSignIn");
  const preview = sliceFunction(renderer, "UnconfiguredPreview");
  const app = sliceFunction(renderer, "App");
  assert.match(configured, /integralActivation\.start\(\)/);
  assert.match(configured, /Finish signing in in your browser/);
  assert.match(
    configured,
    /Once Integral One opens, you can close the browser tab/,
  );
  assert.match(configured, /Restart sign-in/);
  assert.match(configured, /integralActivation\.restartSignin\(\)/);
  assert.doesNotMatch(preview, /integralActivation\.start\(/);
  assert.match(
    preview,
    /Account signup is unavailable in this preview\. Existing local data is preserved\./,
  );
  assert.match(app, /context\.configured \? \(\s*<ConfiguredSignIn \/>/);
  assert.match(app, /<UnconfiguredPreview \/>/);
  assert.match(app, /context\.canContinueOffline &&/);
  assert.match(app, /Continue offline/);
  assert.match(app, /integralActivation\.offline\(\)/);
  assert.match(
    app,
    /context\.existingData &&\s*\(!context\.returning \|\| context\.recoveryNeeded\)/,
  );
  assert.match(app, /Open local workspace/);
  assert.match(app, /integralActivation\.recover\(\)/);
  assert.doesNotMatch(
    renderer,
    /offlineImport|setup-code|importReceipt|integralActivation\.register|publishableKey|getToken/,
  );
  assert.match(
    renderer,
    /https:\/\/auth\.saas\.apps\.trueselph\.com\/oidc/,
  );
  assert.match(renderer, /local files stay on this computer/);
  assert.match(renderer, /this tenant\u2019s user list includes dev signups/);
  assert.match(renderer, /Your files and records stay on this computer/);
  assert.doesNotMatch(renderer, /stored session|second user list/i);
  assert.doesNotMatch(css, /display:\s*grid|grid-template-columns|column-count/);
  assert.equal((css.match(/@media\s*\(max-width:/g) || []).length, 1);
  assert.match(
    css,
    /\.account-page\s*\{[^}]*width:\s*min\(100% - 48px,\s*384px\)/,
  );
  assert.match(windowSource, /minWidth:\s*360/);
  assert.match(windowSource, /minHeight:\s*560/);
});

test("the account page keeps accessible controls in one column", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "../accounts/account.css"),
    "utf8",
  );
  const renderer = fs.readFileSync(
    path.join(__dirname, "../accounts/renderer.jsx"),
    "utf8",
  );
  assert.match(css, /\.action\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /button:focus-visible/);
  assert.match(renderer, /<h1>/);
  assert.match(renderer, /Restart sign-in/);
  assert.doesNotMatch(
    renderer,
    /ClerkFailed|window\.location\.hash|from ["']\.\/appearance["']/,
  );
});

test("restart sign-in is available only to the account main frame and preserves local identity", async (t) => {
  const f = fixture(t);
  saveReceipt(f.home, f.state, f.sign(), f.config);
  const original = readState(f.home).receipt;
  const { EventEmitter } = require("node:events");
  const handlers = new Map(),
    opened = [],
    app = new EventEmitter();
  let win,
    restarted = 0,
    quit = 0;
  app.relaunch = () => restarted++;
  app.quit = () => {
    quit++;
    app.emit("before-quit");
  };
  const controller = createController({
    config: {
      contractVersion: 3,
      provider: "logto",
      setupMode: "logto",
      configured: true,
      environment: "production",
      appId: "app_public_test",
      issuer: "https://auth.saas.apps.trueselph.com/oidc",
    },
    electron: {
      app,
      clipboard: {},
      shell: { openExternal: async (url) => opened.push(url) },
      ipcMain: {
        handle: (n, fn) => handlers.set(n, fn),
        removeHandler: (n) => handlers.delete(n),
      },
      session: {
        fromPartition: () => ({
          setPermissionRequestHandler() {},
          setPermissionCheckHandler() {},
          protocol: { handle() {} },
        }),
      },
      BrowserWindow: class extends EventEmitter {
        constructor() {
          super();
          win = this;
          this.webContents = new EventEmitter();
          this.webContents.mainFrame = { url: "integral-one://account/" };
          this.webContents.setWindowOpenHandler = () => {};
        }
        isDestroyed() {
          return false;
        }
        async loadURL() {}
        close() {
          this.emit("closed");
        }
      },
    },
  });
  const previous = process.env.INTEGRAL_HOME;
  process.env.INTEGRAL_HOME = f.home;
  t.after(() => {
    controller.cleanup();
    if (previous === undefined) delete process.env.INTEGRAL_HOME;
    else process.env.INTEGRAL_HOME = previous;
  });
  void controller.beforeBoot({ userData: f.home, forceSignIn: true });
  const restart = handlers.get("integral-one:account-restart");
  await assert.rejects(
    restart({ sender: {}, senderFrame: { url: "https://foreign.example" } }),
    /Untrusted/,
  );
  assert.equal(opened.length, 0);
  assert.equal(restarted, 0);
  await restart({
    sender: win.webContents,
    senderFrame: win.webContents.mainFrame,
  });
  assert.equal(opened.length, 1);
  assert.equal(restarted, 0);
  assert.equal(quit, 0);
  assert.equal(readState(f.home).receipt, original);
  assert.equal(readState(f.home).installationId, f.state.installationId);
});

test("closing initial signup quits normally without rejecting Core boot or changing local identity", async (t) => {
  const f = fixture(t),
    handlers = new Map();
  const { EventEmitter } = require("node:events");
  const app = new EventEmitter();
  let win,
    quits = 0,
    rejected = false;
  app.quit = () => {
    quits++;
    app.emit("before-quit");
  };
  const controller = createController({
    config: f.config,
    createBridge: () => ({ cleanup() {} }),
    electron: {
      app,
      clipboard: {},
      ipcMain: {
        handle: (n, fn) => handlers.set(n, fn),
        removeHandler: (n) => handlers.delete(n),
      },
      session: {
        fromPartition: () => ({
          setPermissionRequestHandler() {},
          setPermissionCheckHandler() {},
          protocol: { handle() {} },
        }),
      },
      BrowserWindow: class extends EventEmitter {
        constructor() {
          super();
          win = this;
          this.webContents = new EventEmitter();
          this.webContents.setWindowOpenHandler = () => {};
        }
        async loadURL() {}
      },
    },
  });
  const prior = process.env.INTEGRAL_HOME;
  process.env.INTEGRAL_HOME = f.home;
  t.after(() => {
    if (prior === undefined) delete process.env.INTEGRAL_HOME;
    else process.env.INTEGRAL_HOME = prior;
  });
  void controller.beforeBoot({ userData: f.home }).catch(() => {
    rejected = true;
  });
  win.emit("closed");
  await Promise.resolve();
  assert.equal(quits, 1);
  assert.equal(rejected, false);
  assert.equal(readState(f.home).installationId, f.state.installationId);
  assert.equal(readState(f.home).receipt, undefined);
  assert.equal(handlers.size, 0);
});
