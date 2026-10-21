"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const root = path.join(__dirname, ".."),
  frontend = path.join(root, ".build/frontend");
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
async function qualify() {
  if (!process.env.npm_execpath)
    throw new Error("Run npm run qualify:ui:dependencies after qualify:ui.");
  const audit = spawnSync(
    process.execPath,
    [process.env.npm_execpath, "audit", "--json"],
    {
      cwd: frontend,
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  if (audit.error || ![0, 1].includes(audit.status))
    throw new Error("UI dependency audit could not complete.");
  const report = JSON.parse(audit.stdout);
  if (report.error || !report.metadata?.vulnerabilities)
    throw new Error("UI dependency audit returned no usable result.");
  const advisories = Object.values(report.vulnerabilities || {}).flatMap((v) =>
    v.via.filter((a) => typeof a === "object"),
  );
  const packages = [...new Set(advisories.map((a) => a.dependency))].sort();
  const { build } = await import(
    pathToFileURL(path.join(frontend, "node_modules/vite/dist/node/index.js"))
      .href
  );
  let closure;
  // Tailwind 3 resolves its relative content globs from process.cwd(), even
  // when Vite receives an explicit root. Match `npm run build --prefix ...`.
  const previousDirectory = process.cwd();
  process.chdir(frontend);
  try {
    await build({
      root: frontend,
      configFile: path.join(frontend, "vite.config.ts"),
      plugins: [
        {
          name: "one-production-dependency-closure",
          generateBundle(_options, bundle) {
            const modules = [
              ...new Set(
                Object.values(bundle)
                  .filter((item) => item.type === "chunk")
                  .flatMap((chunk) => Object.keys(chunk.modules)),
              ),
            ]
              .map((name) => name.replaceAll("\\", "/"))
              .sort();
            const included = packages.filter((name) =>
              modules.some((id) => id.includes(`/node_modules/${name}/`)),
            );
            if (included.length)
              throw new Error(
                `Advisory-affected packages enter the browser bundle: ${included.join(", ")}`,
              );
            closure = {
              checked_at: new Date().toISOString(),
              frontend_lock_sha256: digest(
                fs.readFileSync(path.join(frontend, "package-lock.json")),
              ),
              module_count: modules.length,
              modules_sha256: digest(
                JSON.stringify(
                  modules.map((id) =>
                    id.replaceAll(frontend.replaceAll("\\", "/"), "<frontend>"),
                  ),
                ),
              ),
              audited_packages_absent_from_browser_bundle: packages,
              browser_exposure:
                "No audited advisory-affected package is included in this build's Rollup module closure.",
              unresolved_tooling_advisories: advisories.map(
                ({ dependency, url, title, severity, range }) => ({
                  dependency,
                  url,
                  title,
                  severity,
                  range,
                }),
              ),
              limitation:
                "Build-time/CLI advisories remain. Build only reviewed inputs without production credentials; this does not establish upstream remediation or owner risk acceptance.",
            };
          },
        },
      ],
    });
  } finally {
    process.chdir(previousDirectory);
  }
  if (!closure)
    throw new Error("The production bundler did not produce a module closure.");
  const dist = path.join(frontend, "dist");
  closure.styles = require("./verify-ui-styles").verifyUIStyles(dist);
  function inventory(dir, prefix = "") {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
      if (item.isSymbolicLink())
        throw new Error("Dist symlinks cannot establish artifact evidence.");
      const name = prefix + item.name,
        file = path.join(dir, item.name);
      return item.isDirectory()
        ? inventory(file, name + "/")
        : [[name, digest(fs.readFileSync(file))]];
    });
  }
  closure.dist_sha256 = Object.fromEntries(
    inventory(dist).sort(([a], [b]) => a.localeCompare(b)),
  );
  const output = path.join(root, ".local/verification/release-readiness");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "ui-dependency-closure.json"),
    JSON.stringify(closure, null, 2) + "\n",
  );
  console.log(
    `Production bundle checked: ${closure.module_count} modules; ${packages.length} advisory-affected packages excluded. Tooling advisories remain separately reported.`,
  );
}
qualify().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
