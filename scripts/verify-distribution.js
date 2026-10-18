'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function relativeFile(root, name) {
  if (typeof name !== 'string' || path.posix.isAbsolute(name) || path.win32.isAbsolute(name) || name.split(/[\\/]/).some(p => !p || p === '..' || p === '.')) throw new Error('Invalid artifact path.');
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Artifact symlinks are not accepted.');
  }
  if (!fs.statSync(current).isFile()) throw new Error('Expected an artifact file.');
  return current;
}
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function inventory(root, prefix = '') {
  return fs.readdirSync(path.join(root, prefix), {withFileTypes:true}).flatMap(item => {
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink()) throw new Error('Source snapshot contains a symlink.');
    return item.isDirectory() ? inventory(root, name) : [name];
  });
}
function verifyDistribution(root) {
  const pins = JSON.parse(fs.readFileSync(path.join(root,'distribution.json'),'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  if (pins.contract_version !== 1 || pins.mode !== 'local' || pins.product !== 'integral-one') throw new Error('Unsupported One distribution contract.');
  if (pkg.license !== 'Apache-2.0') throw new Error('The adopted product license is Apache-2.0.');
  if (hash(relativeFile(root,pins.desktop_host.artifact)) !== pins.desktop_host.sha256) throw new Error('Desktop host differs from the reviewed pin.');
  if (hash(relativeFile(root,pins.core.base_wheel)) !== pins.core.wheel_sha256) throw new Error('Core wheel differs from the reviewed pin.');
  const source = path.join(root,'vendor/core-ui-source');
  const manifestFile = relativeFile(source,'core-source.json');
  if (hash(manifestFile) !== pins.core.ui_manifest_sha256) throw new Error('Core UI manifest differs from reviewed pin.');
  const manifest = JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if (manifest.contract_version !== 1) throw new Error('Unsupported UI source contract.');
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (hash(relativeFile(source,name)) !== expected) throw new Error('Core UI source integrity mismatch.');
  }
  const actual = inventory(source).filter(name => name !== 'core-source.json').sort();
  if (JSON.stringify(actual) !== JSON.stringify(Object.keys(manifest.files).sort())) throw new Error('Unrecorded Core UI source files.');
  if (pkg.build.appId !== pins.data_compatibility.app_id || pins.data_compatibility.user_data_name !== 'Integral') throw new Error('Existing app identity/data migration requires explicit review.');
  if (!['planned','implemented_unqualified'].includes(pins.registration.status) || pins.registration.public_release_blocked_until_qualified !== true) throw new Error('Do not claim unqualified registration is implemented.');
  for (const name of ['LICENSE','NOTICE','LICENSING.md']) if (!fs.existsSync(path.join(root,name))) throw new Error('Missing licensing material.');
  return pins;
}
if (require.main === module) {
  verifyDistribution(path.join(__dirname,'..'));
  console.log('Core/host artifacts, UI inventory, Apache notices and stable data identity verified.');
}
module.exports = {verifyDistribution, relativeFile, hash};
