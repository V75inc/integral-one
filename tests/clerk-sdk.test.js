"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
function fixture(t) {
  const app = new EventEmitter(),
    handlers = new Map(),
    opened = [],
    schemes = [];
  app.isReady = () => false;
  app.hasSingleInstanceLock = () => true;
  app.setAsDefaultProtocolClient = () => true;
  const electron = {
    app,
    protocol: {
      registerSchemesAsPrivileged: (values) => schemes.push(...values),
    },
    ipcMain: {
      handle: (name, fn) => handlers.set(name, fn),
      removeHandler: (name) => handlers.delete(name),
    },
    shell: { openExternal: async (url) => opened.push(url) },
    BrowserWindow: {
      fromWebContents: () => ({
        isDestroyed: () => false,
        isMinimized: () => false,
        focus: () => {},
      }),
    },
  };
  const file = require.resolve("@clerk/electron"),
    exports = {};
  vm.runInNewContext(
    fs.readFileSync(file, "utf8"),
    {
      exports,
      process: { platform: "darwin" },
      URL,
      Buffer,
      setTimeout,
      clearTimeout,
      console,
      require: (name) =>
        name === "electron"
          ? electron
          : require(
              name.startsWith("./")
                ? path.join(path.dirname(file), name)
                : name,
            ),
    },
    { filename: file },
  );
  const storage = new Map();
  const bridge = exports.createClerkBridge({
    renderer: { scheme: "integral-one", host: "account" },
    manageSingleInstanceLock: false,
    storage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      },
    },
  });
  t.after(() => bridge.cleanup());
  const frame = {},
    sender = { getType: () => "window", mainFrame: frame };
  return {
    app,
    handlers,
    opened,
    schemes,
    event: { sender, senderFrame: frame },
    bridge,
  };
}
test("actual pinned SDK registers secure scheme and rejects iframe token-cache callers", (t) => {
  const f = fixture(t),
    get = f.handlers.get("clerk:token-cache:get");
  assert.equal(f.schemes[0].privileges.secure, true);
  assert.equal(f.schemes[0].scheme, "integral-one");
  assert.throws(
    () => get({ ...f.event, senderFrame: {} }, "token"),
    /main frame/,
  );
  f.handlers.get("clerk:token-cache:save")(
    f.event,
    "token",
    "test-memory-value",
  );
  assert.equal(get(f.event, "token"), "test-memory-value");
  f.handlers.get("clerk:token-cache:clear")(f.event, "token");
  assert.equal(get(f.event, "token"), null);
});
test("actual SDK opens browser OAuth and only delivers callbacks for the registered scheme/host/path", async (t) => {
  const f = fixture(t);
  assert.equal(
    f.handlers.get("clerk:oauth-transport:get-redirect-url")(f.event),
    "integral-one://account/",
  );
  const pending = f.handlers.get("clerk:oauth-transport:open")(
    f.event,
    "https://accounts.google.com/o/oauth2/v2/auth?state=test-only",
  );
  assert.equal(f.opened.length, 1);
  let resolved = false;
  pending.then(() => {
    resolved = true;
  });
  f.app.emit(
    "open-url",
    {
      preventDefault: () =>
        assert.fail("Foreign callback must not be consumed"),
    },
    "integral-one://foreign/?test=1",
  );
  await Promise.resolve();
  assert.equal(resolved, false);
  f.app.emit(
    "open-url",
    { preventDefault: () => {} },
    "integral-one://account/?test=1",
  );
  assert.equal((await pending).callbackUrl, "integral-one://account/?test=1");
  // SDK transport routing is covered here. Real provider/state/nonce verification
  // requires the packaged live social round trip and is reported separately.
});
test("actual SDK cancels an outstanding OAuth request during cleanup", async (t) => {
  const f = fixture(t),
    pending = f.handlers.get("clerk:oauth-transport:open")(
      f.event,
      "https://login.microsoftonline.com/test-only",
    );
  const rejected = assert.rejects(pending, /cancelled/);
  f.bridge.cleanup();
  await rejected;
  assert.equal(f.handlers.size, 0);
});
