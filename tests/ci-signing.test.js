"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const os = require("node:os"), { spawnSync } = require("node:child_process");
const yaml = require("js-yaml");
const { verifyCiSigning, hostedSigningRequested } = require("../scripts/verify-ci-signing");
const complete = {
  CSC_LINK: "sentinel-certificate",
  CSC_KEY_PASSWORD: "sentinel-certificate-password",
  APPLE_ID: "sentinel-account",
  APPLE_APP_SPECIFIC_PASSWORD: "sentinel-notary-password",
  APPLE_TEAM_ID: "sentinel-team",
};

test("hosted Mac preflight identifies every absent secret without suggesting the runner has a local Keychain profile", () => {
  assert.throws(() => verifyCiSigning("darwin", { APPLE_KEYCHAIN_PROFILE: "integral-one-notary" }), error => {
    for (const name of ["MACOS_CSC_LINK", "MACOS_CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]) assert.ok(error.message.includes(name));
    assert.ok(error.message.includes("No signing was attempted"));
    assert.ok(!error.message.includes("set APPLE_KEYCHAIN_PROFILE"));
    return true;
  });
});

test("ordinary pin pushes keep the local signing route unless hosted signing is explicitly enabled", () => {
  for (const enabled of [undefined, "", "false"]) assert.equal(hostedSigningRequested("push", enabled), false);
  assert.equal(hostedSigningRequested("push", "true"), true);
  for (const enabled of [undefined, "", "false", "true"]) assert.equal(hostedSigningRequested("workflow_dispatch", enabled), true);
  assert.throws(() => hostedSigningRequested("push", "yes"), /true or false/);
  assert.throws(() => hostedSigningRequested("pull_request", "true"), /event/);
});

test("each missing or blank Mac credential fails without exposing supplied values", () => {
  for (const key of Object.keys(complete)) for (const value of [undefined, "", " "]) {
    const env = { ...complete, [key]: value };
    assert.throws(() => verifyCiSigning("darwin", env), error => {
      for (const secret of Object.values(complete)) assert.ok(!error.message.includes(secret));
      return true;
    });
  }
});

test("complete hosted Mac credentials pass a read-only presence check", () => {
  const env = { ...complete }; verifyCiSigning("darwin", env); assert.deepEqual(env, complete);
});

test("Windows requires the store/provider pin, independently of Mac P12 credentials", () => {
  for (const value of [undefined, "", " ", "a".repeat(39), "z".repeat(40)]) assert.throws(() => verifyCiSigning("win32", { ONE_WINDOWS_CERT_SHA1: value }));
  assert.doesNotThrow(() => verifyCiSigning("win32", { ONE_WINDOWS_CERT_SHA1: "a".repeat(40) }));
  assert.throws(() => verifyCiSigning("linux", complete), /macOS or Windows/);
});

test("hosted signing preflight runs before dependency setup and secrets remain confined to signing steps", () => {
  const workflow = yaml.load(fs.readFileSync(path.join(__dirname, "../.github/workflows/installer-candidate.yml"), "utf8"));
  const build = workflow.jobs.build, steps = build.steps;
  const preflight = steps.findIndex(step => step.run === "node scripts/verify-ci-signing.js");
  assert.ok(preflight > 0);
  assert.ok(preflight < steps.findIndex(step => step.run === "npm run setup"));
  const signed = steps.find(step => step.run === "npm run build:installers -- --signed");
  assert.deepEqual(steps[preflight].env, signed.env);
  assert.ok(!Object.values(build.env).some(value => String(value).includes("secrets.")));
  for (const step of steps) if (step !== steps[preflight] && step !== signed) assert.ok(!Object.values(step.env || {}).some(value => String(value).includes("secrets.")));
});

test("candidate assembly installs its JavaScript dependencies before validating manifests", () => {
  const workflow = yaml.load(fs.readFileSync(path.join(__dirname, "../.github/workflows/installer-candidate.yml"), "utf8"));
  const steps = workflow.jobs.assemble.steps;
  const install = steps.findIndex(step => step.run === "npm ci --ignore-scripts");
  const merge = steps.findIndex(step => step.run?.startsWith("node scripts/installer-manifest.js merge "));
  assert.ok(install >= 0 && install < merge);
});

test("automatic local-route runs do not request signing approval or report a signed artifact", () => {
  const workflow = yaml.load(fs.readFileSync(path.join(__dirname, "../.github/workflows/installer-candidate.yml"), "utf8"));
  const plan = workflow.jobs.plan;
  const route = plan.steps.findIndex(step => step.id === "route");
  const protect = plan.steps.findIndex(step => step.name?.startsWith("Require a protected"));
  assert.ok(route >= 0 && route < protect);
  assert.equal(plan.steps[route].run, "node scripts/verify-ci-signing.js route");
  assert.equal(plan.steps[protect].if, "steps.route.outputs.hosted == 'true'");
  assert.equal(plan.outputs.hosted, "${{ steps.route.outputs.hosted }}");
  for (const job of [workflow.jobs.build, workflow.jobs.assemble]) assert.equal(job.if, "needs.plan.outputs.hosted == 'true'");
});

test("route CLI writes an explicit local selection without requesting or reading credentials", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "one-ci-route-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, "output"), summary = path.join(root, "summary");
  const result = spawnSync(process.execPath, [path.join(__dirname, "../scripts/verify-ci-signing.js"), "route"], {
    env: { GITHUB_EVENT_NAME: "push", GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary }, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(output, "utf8"), "hosted=false\n");
  assert.ok(fs.readFileSync(summary, "utf8").includes("will not build a signed artifact"));
});

test("an unconfigured hosted runner fails the CLI without executing a build", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "../scripts/verify-ci-signing.js")], { env: {}, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.ok(/desktop-release|ONE_WINDOWS_CERT_SHA1|macOS or Windows/.test(result.stderr));
  assert.ok(!result.stderr.includes("at verifyCiSigning"), "The CLI should explain configuration instead of dumping a stack");
});
