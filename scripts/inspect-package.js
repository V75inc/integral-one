'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');
const {hash} = require('./verify-distribution');
const root=path.join(__dirname,'..');
function archives(dir) {
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>{
    const p=path.join(dir,item.name);
    if(item.isSymbolicLink())return [];
    return item.isDirectory()?archives(p):item.name==='app.asar'?[p]:[];
  });
}
if(process.argv.length>3)throw new Error('Usage: node scripts/inspect-package.js [package-directory]');
const candidates=archives(path.resolve(root,process.argv[2] || 'release'));
assert.equal(candidates.length,1,'Expected exactly one packaged directory bundle; choose a clean output directory for inspection.');
const archive=candidates[0],resources=path.dirname(archive),members=asar.listPackage(archive);
for(const member of ['desktop/main.js','desktop/loading.html','desktop/accounts/ui/integral-logo.svg','desktop/accounts/controller.js','desktop/accounts/preload.js','desktop/accounts/ui/account.js','desktop/accounts/config.runtime.json','distribution.json','node_modules/@integral/desktop-host/lib/host.js'])assert.ok(members.includes('/'+member),`Missing ${member}`);
assert.ok(!members.some(n=>/\.local|GITHUB-SETUP|packaged-local-proof|github-repository|\.env|core-ui-source|cua-driver/.test(n)),'Internal/source-only resources leaked into the app');
for(const name of ['LICENSE','NOTICE','LICENSING.md','PRIVACY.md','CODE_SIGNING.md'])assert.equal(hash(path.join(resources,name)),hash(path.join(root,name)),`Packaged ${name} differs from source`);
assert.equal(hash(path.join(resources,'notices/uv/LICENSE-MIT')),hash(path.join(root,'vendor/licenses/uv/LICENSE-MIT')),'Bundled uv license differs from reviewed source');
for(const name of ['THIRD-PARTY-NOTICES.txt','inventory.json','electron/LICENSE','electron/LICENSES.chromium.html'])assert.equal(hash(path.join(resources,'notices',name)),hash(path.join(root,'resources/notices',name)),`Packaged dependency notice differs: ${name}`);
const runtime=JSON.parse(fs.readFileSync(path.join(resources,'core/runtime.json'),'utf8'));
assert.equal(runtime.deployment_profile,'desktop_single_user');
for(const [name,key] of [[runtime.coreWheel,runtime.coreWheel],[process.platform==='win32'?'uv.exe':'uv','uv']])assert.equal(hash(path.join(resources,'core',name)),runtime.sha256[key]);
assert.match(asar.extractFile(archive,'desktop/main.js').toString(),/Integral \| one/);
const accountConfig=JSON.parse(asar.extractFile(archive,'desktop/accounts/config.runtime.json').toString());
require('../desktop/accounts/config').validateConfig(accountConfig);
assert.ok(!JSON.stringify(accountConfig).includes('sk_live_') && !JSON.stringify(accountConfig).includes('sk_test_'),'Service secret must not enter the app');
console.log(JSON.stringify({result:'pass',platform:process.platform,arch:process.arch,asar_sha256:hash(archive),runtime_profile:runtime.deployment_profile,apache_notices:true,internal_files_excluded:true,signing:'not qualified'},null,2));
