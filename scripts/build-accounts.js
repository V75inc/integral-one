"use strict";
const path = require("node:path");
const fs = require("node:fs");
const esbuild = require("esbuild");
const root = path.join(__dirname, "..");
const output = path.join(root, "desktop/accounts/ui");
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
const config = validateConfig(
  JSON.parse(
    fs.readFileSync(
      process.env.INTEGRAL_ACCOUNT_CONFIG ||
        path.join(root, "desktop/accounts/config.json"),
      "utf8",
    ),
  ),
);
fs.writeFileSync(
  path.join(root, "desktop/accounts/config.runtime.json"),
  JSON.stringify(config, null, 2) + "\n",
);
console.log(
  "Isolated Clerk account renderer and sandbox-compatible preload built.",
);
