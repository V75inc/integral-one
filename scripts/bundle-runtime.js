'use strict';
const path = require('node:path');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const {verifyDistribution, hash} = require('./verify-distribution');
const root = path.join(__dirname,'..');
const pins = verifyDistribution(root);
const baseWheel = path.join(root,pins.core.base_wheel);
const ui = path.join(root,'.build/frontend/dist');
require('./verify-ui-styles').verifyUIStyles(ui);
const buildManifest = JSON.parse(fs.readFileSync(path.join(root,'.build/frontend/distribution-build.json'),'utf8'));
if (buildManifest.product !== 'integral-one' || buildManifest.core_source_tree_sha256 !== JSON.parse(fs.readFileSync(path.join(root,'vendor/core-ui-source/core-source.json'),'utf8')).source_tree_sha256) throw new Error('UI build came from a different source snapshot.');
const overlayRoot = path.join(root, 'frontend/host');
function inventory(dir, prefix = '') {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(item => {
    const name = prefix + item.name;
    if (item.isSymbolicLink()) throw new Error('Product overlay must not contain symlinks.');
    return item.isDirectory() ? inventory(path.join(dir, item.name), name + '/') : [name];
  }).sort();
}
if (JSON.stringify(inventory(overlayRoot)) !== JSON.stringify(Object.keys(buildManifest.overlay_sha256).sort())) throw new Error('Product overlay inventory changed since UI composition.');
for (const [name, expected] of Object.entries(buildManifest.overlay_sha256)) if (hash(path.join(root,'frontend/host',name)) !== expected) throw new Error('Product overlay changed since the UI composition.');
const output = path.join(root,'.build/runtime',pins.core.wheel_filename);
execFileSync(process.env.PYTHON || 'python3',[path.join(__dirname,'compose-runtime.py'),'--base',baseWheel,'--ui',ui,'--output',output,'--sha256',pins.core.wheel_sha256],{stdio:'inherit'});
const executable = process.platform === 'win32' ? 'uv.exe' : 'uv';
const uv = process.env.INTEGRAL_UV_BINARY || (process.env.PATH || '').split(path.delimiter).map(folder=>path.join(folder,executable)).find(file=>fs.existsSync(file));
if (!uv) throw new Error('Install uv, or set INTEGRAL_UV_BINARY to the reviewed platform binary.');
if (!/^uv 0\.11\.3(?:\s|$)/.test(execFileSync(uv, ['--version'], {encoding:'utf8'}))) throw new Error('Use the reviewed uv 0.11.3 runtime; its license notice is shipped with this distribution.');
require('@integral/desktop-host/bundle-runtime').bundleRuntime({...process.env,INTEGRAL_CORE_WHEEL:output,INTEGRAL_UV_BINARY:uv},{base:path.join(root,'resources/core')});
require('./collect-notices');
