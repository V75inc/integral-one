'use strict';
// Collect from the exact installed trees used to build, retaining upstream text.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const output = path.join(root, 'resources/notices');
fs.mkdirSync(output, { recursive: true });
const inventory = [];
const sections = [];
for (const [scope, base] of [['desktop', root], ['core-ui', path.join(root, '.build/frontend')]]) {
  const lock = JSON.parse(fs.readFileSync(path.join(base, 'package-lock.json'), 'utf8'));
  for (const [relative, metadata] of Object.entries(lock.packages)) {
    if (!relative || metadata.link) continue;
    if (!relative.startsWith('node_modules/') || relative.split('/').includes('..')) throw new Error('Invalid dependency path.');
    const directory = path.join(base, relative);
    if (!fs.existsSync(directory)) continue; // Optional dependencies for other OSes.
    const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    const names = fs.readdirSync(directory).filter(name => /^(licen[cs]e|copying|notice)(\..*)?$/i.test(name) && fs.statSync(path.join(directory, name)).isFile()).sort();
    const item = { scope, name: pkg.name, version: pkg.version, license: pkg.license || metadata.license || 'UNDECLARED', notices: names, source: `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}` };
    inventory.push(item);
    sections.push(`\n=== ${item.name}@${item.version} (${scope}) ===\nDeclared license: ${JSON.stringify(item.license)}\nSource/package: ${item.source}\n`);
    for (const name of names) sections.push(`--- ${name} ---\n${fs.readFileSync(path.join(directory, name), 'utf8')}\n`);
    if (!names.length) sections.push('No top-level notice file supplied in this installed package. Check its upstream license and source before production distribution.\n');
  }
}
const electron = path.dirname(require.resolve('electron/package.json'));
fs.mkdirSync(path.join(output, 'electron'), { recursive: true });
for (const name of ['LICENSE', 'LICENSES.chromium.html']) {
  fs.copyFileSync(path.join(electron, 'dist', name), path.join(output, 'electron', name));
}
fs.mkdirSync(path.join(output, 'uv'), { recursive: true });
fs.copyFileSync(path.join(root, 'vendor/licenses/uv/LICENSE-MIT'), path.join(output, 'uv/LICENSE-MIT'));
fs.writeFileSync(path.join(output, 'THIRD-PARTY-NOTICES.txt'), 'Integral One dependency notices. Upstream texts and license choices remain applicable.\n' + sections.join(''));
fs.writeFileSync(path.join(output, 'inventory.json'), JSON.stringify({ schemaVersion: 1, scope: 'Installed npm build trees, Electron/Chromium notices and uv license; not a complete native/Python/asset SBOM', packages: inventory }, null, 2) + '\n');
console.log(`Collected notices for ${inventory.length} installed npm packages plus Electron/Chromium and uv. Full native/asset license review remains a release gate.`);
