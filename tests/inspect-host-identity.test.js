"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { finished } = require('node:stream/promises');
const asar = require('@electron/asar');
const { verifyPackagedHost } = require('../scripts/inspect-host-identity');

const packedHost = 'packed/node_modules/@integral/desktop-host';

async function fixture(t, alter = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'one-package-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
  };
  const product = {
    version: '0.1.14',
    dependencies: { '@integral/desktop-host': 'file:vendor/host17.tgz' },
  };
  const pins = { product_version: '0.1.14', desktop_host: { version: '0.1.7-dev.17' } };
  write('package.json', JSON.stringify(product));
  write('distribution.json', JSON.stringify(pins));
  write('packages/desktop-host/lib/host.js', 'reviewed source');
  write('packed/package.json', JSON.stringify(product));
  write('packed/distribution.json', JSON.stringify(pins));
  write(`${packedHost}/package.json`, JSON.stringify({ version: pins.desktop_host.version }));
  write(`${packedHost}/lib/host.js`, 'reviewed source');
  alter(write);

  const archive = path.join(root, 'app.asar');
  const output = await asar.createPackage(path.join(root, 'packed'), archive);
  await finished(output);
  return { root, archive };
}

test('package inspection binds One version, distribution and actual host code', async t => {
  const { root, archive } = await fixture(t);
  assert.equal(verifyPackagedHost(root, archive).files, 1);
});

for (const [label, alter, message] of [
  ['host', write => write(`${packedHost}/lib/host.js`, 'changed code'), /Packaged host code differs/],
  ['version', write => write('packed/package.json', JSON.stringify({ version: '0.1.13', dependencies: {} })), /Packaged One version differs/],
  ['extra', write => write(`${packedHost}/lib/extra.js`, 'unreviewed'), /Unreviewed host code in package/],
]) {
  test(`package inspection rejects ${label} drift`, async t => {
    const { root, archive } = await fixture(t, alter);
    assert.throws(() => verifyPackagedHost(root, archive), message);
  });
}
