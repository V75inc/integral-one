"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
test("updated build proxy preserves the Electron downloader bootstrap API and forwards HTTP requests", async (t) => {
  const proxy = http.createServer((req, res) => {
    res.end(req.url);
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => proxy.close(resolve)));
  const script = `require('global-agent').bootstrap();
    require('http').get('http://integral-proxy-test.invalid/probe', res => {
      let body=''; res.on('data', chunk => body += chunk);
      res.on('end', () => process.stdout.write(body));
    }).on('error', () => process.exit(1));`;
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ["-e", script],
    {
      cwd: require("node:path").join(__dirname, ".."),
      timeout: 10000,
      env: {
        ...process.env,
        GLOBAL_AGENT_HTTP_PROXY: `http://127.0.0.1:${proxy.address().port}`,
        GLOBAL_AGENT_NO_PROXY: "",
        NODE_OPTIONS: "",
      },
    },
  );
  assert.equal(stdout, "http://integral-proxy-test.invalid/probe");
});
