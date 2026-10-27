"use strict";
const path = require("node:path");
const fs = require("node:fs");
const esbuild = require("esbuild");
const root = path.join(__dirname, "..");
const output = path.join(root, "desktop/accounts/ui");
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(root, "accounts/renderer.jsx")],
  outfile: path.join(output, "account.js"),
  bundle: true,
  minify: true,
  platform: "browser",
  format: "esm",
  target: "chrome140",
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "linked",
});
esbuild.buildSync({
  entryPoints: [path.join(root, "desktop/update-preload-entry.js")],
  outfile: path.join(root, "desktop/update-preload.js"), bundle: true,
  platform: "node", format: "cjs", external: ["electron"], target: "node22",
});
esbuild.buildSync({
  entryPoints: [path.join(root, "desktop/accounts/preload-entry.js")],
  outfile: path.join(root, "desktop/accounts/preload.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  target: "node22",
  legalComments: "linked",
});
for (const name of ["index.html", "account.css"])
  fs.copyFileSync(path.join(root, "accounts", name), path.join(output, name));
fs.copyFileSync(
  path.join(root, "desktop/icons/integral-light.svg"),
  path.join(output, "integral-logo.svg"),
);
const { validateConfig } = require("../desktop/accounts/config");
const productionConfig = path.join(
  root,
  "desktop/accounts/config.production.json",
);
const isProductionConfigured =
  fs.existsSync(productionConfig) &&
  (() => {
    try {
      return (
        JSON.parse(fs.readFileSync(productionConfig, "utf8")).configured === true
      );
    } catch {
      return false;
    }
  })();
const defaultConfig = isProductionConfigured
  ? productionConfig
  : path.join(root, "desktop/accounts/config.json");
const config = validateConfig(
  JSON.parse(
    fs.readFileSync(
      process.env.INTEGRAL_ACCOUNT_CONFIG || defaultConfig,
      "utf8",
    ),
  ),
);
fs.writeFileSync(
  path.join(root, "desktop/accounts/config.runtime.json"),
  JSON.stringify(config, null, 2) + "\n",
);
console.log(
  "Isolated Logto account renderer and sandbox-compatible preload built.",
);
