"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { verifyUIStyles, REQUIRED } = require("../scripts/verify-ui-styles");
function fixture(t, css) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "one-styles-"));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dist, "assets"));
  fs.writeFileSync(
    path.join(dist, "index.html"),
    '<link rel="stylesheet" href="/assets/ui.css">',
  );
  fs.writeFileSync(path.join(dist, "assets/ui.css"), css);
  return dist;
}
test("packaging rejects CSS containing base styles without generated layout utilities", (t) => {
  const dist = fixture(t, "body{background:#181818}.theme-dark{color:white}");
  assert.throws(() => verifyUIStyles(dist), /missing layout utility/);
});
test("packaging accepts linked CSS containing the workspace layout utilities", (t) => {
  const dist = fixture(
    t,
    REQUIRED.map((name) => `.${name}{display:block}`).join(""),
  );
  assert.deepEqual(verifyUIStyles(dist).required_layout_utilities, REQUIRED);
  fs.writeFileSync(
    path.join(dist, "index.html"),
    '<link rel="stylesheet" href="https://example.com/ui.css">',
  );
  assert.throws(() => verifyUIStyles(dist), /no local stylesheet/);
});
