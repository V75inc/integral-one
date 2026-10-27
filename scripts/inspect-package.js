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
// ASAR lists members using the host OS separator; compare one canonical form.
const archive=candidates[0],resources=path.dirname(archive),members=asar.listPackage(archive).map(member=>member.replaceAll('\\','/'));
for(const member of ['desktop/main.js','desktop/loading.html','desktop/accounts/ui/integral-logo.svg','desktop/accounts/controller.js','desktop/accounts/clerk-setup.js','desktop/accounts/preload.js','desktop/accounts/ui/account.js','desktop/accounts/config.runtime.json','distribution.json','node_modules/@integral/desktop-host/lib/host.js','desktop/update-center.js','desktop/update-preload.js','desktop/update-ui/index.html','desktop/runtime-updates/manager.js','desktop/runtime-updates/payload.py'])assert.ok(members.includes('/'+member),`Missing ${member}`);
assert.ok(!members.some(n=> /\/(setup-key|activation|profile-initialized)\.json$/.test(n)), 'Local account state must never enter the app');
assert.ok(!members.some(n=>/\.local|GITHUB-SETUP|packaged-local-proof|github-repository|\.env|core-ui-source|cua-driver/.test(n)),'Internal/source-only resources leaked into the app');
for(const name of ['LICENSE','NOTICE','LICENSING.md','PRIVACY.md','CODE_SIGNING.md'])assert.equal(hash(path.join(resources,name)),hash(path.join(root,name)),`Packaged ${name} differs from source`);
assert.equal(hash(path.join(resources,'notices/uv/LICENSE-MIT')),hash(path.join(root,'vendor/licenses/uv/LICENSE-MIT')),'Bundled uv license differs from reviewed source');
for(const name of ['THIRD-PARTY-NOTICES.txt','inventory.json','electron/LICENSE','electron/LICENSES.chromium.html'])assert.equal(hash(path.join(resources,'notices',name)),hash(path.join(root,'resources/notices',name)),`Packaged dependency notice differs: ${name}`);
const runtime=JSON.parse(fs.readFileSync(path.join(resources,'core/runtime.json'),'utf8'));
assert.equal(runtime.deployment_profile,'desktop_single_user');
assert.equal(runtime.runtime_contract_version,1);
assert.equal(runtime.runtime_preset,'local');
if(process.platform==='darwin')assert.equal(require('node:child_process').execFileSync('/usr/libexec/PlistBuddy',['-c','Print :LSMinimumSystemVersion',path.join(resources,'..','Info.plist')],{encoding:'utf8'}).trim(),require('../package.json').build.mac.minimumSystemVersion,'Packaged macOS minimum differs from the runtime support floor');
for(const [name,key] of [[runtime.coreWheel,runtime.coreWheel],[process.platform==='win32'?'uv.exe':'uv','uv']])assert.equal(hash(path.join(resources,'core',name)),runtime.sha256[key]);
// ASAR also resolves nested extraction paths with the host OS separator.
assert.match(asar.extractFile(archive,path.join('desktop','main.js')).toString(),/Integral \| one/);
const accountConfig=JSON.parse(asar.extractFile(archive,path.join('desktop','accounts','config.runtime.json')).toString());
require('../desktop/accounts/config').validateConfig(accountConfig);
for (const member of ['desktop/updates.js','desktop/releases.js','desktop/release-contract.js','desktop/update-backup.js','desktop/accounts/logto-setup.js','node_modules/electron-updater/out/main.js']) assert.ok(members.includes('/'+member), `Missing ${member}`);
for (const file of ['desktop/main.js','desktop/updates.js','desktop/releases.js','desktop/release-contract.js','desktop/update-backup.js','desktop/accounts/controller.js','desktop/accounts/local-profile.js','desktop/accounts/logto-setup.js','desktop/accounts/clerk-setup.js','desktop/accounts/receipt.js','desktop/accounts/config.js','desktop/accounts/ui/account.js','desktop/accounts/ui/account.css','desktop/accounts/preload.js','desktop/update-center.js','desktop/update-preload.js','desktop/update-ui/index.html','desktop/update-ui/update.js','desktop/update-ui/update.css','desktop/runtime-updates/manager.js','desktop/runtime-updates/releases.js','desktop/runtime-updates/payload.py']) {
  const packedHash = require('node:crypto').createHash('sha256').update(asar.extractFile(archive, path.join(...file.split('/')))).digest('hex');
  assert.equal(packedHash, hash(path.join(root, file)), `Packaged source differs: ${file}`);
}
for (const name of ['host.js', 'core-runtime.js']) assert.equal(require('node:crypto').createHash('sha256').update(asar.extractFile(archive, path.join('node_modules','@integral','desktop-host','lib',name))).digest('hex'), hash(path.join(root, 'packages/desktop-host/lib',name)), 'Packaged host differs from its maintained source: '+name);
const updateConfigFile = path.join(resources, 'app-update.yml');
const packagedProduct = JSON.parse(asar.extractFile(archive, 'package.json').toString());
if (fs.existsSync(updateConfigFile)) {
  const feed = require('js-yaml').load(fs.readFileSync(updateConfigFile, 'utf8'));
  assert.equal(feed.provider, 'github');
  assert.equal(feed.owner, 'V75inc');
  assert.equal(feed.repo, 'integral-one');
  assert.ok(!feed.token && !feed.private, 'Updater must use the public release feed without credentials');
  if (process.platform === 'win32') assert.deepEqual(feed.publisherName, ['V75 Inc.'], 'Windows updater requires the approved publisher pin');
} else assert.ok(!packagedProduct.integralOneUpdates?.enabled, 'Enabled updater needs its packaged public feed configuration');
const closureFile = path.join(root, '.local/verification/release-readiness/ui-dependency-closure.json');
if (fs.existsSync(closureFile)) {
  // Check the packaged wheel, rather than assuming the source dist that was
  // audited is the same one embedded in the installer.
  require('node:child_process').execFileSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c',
    'import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n actual=json.loads(z.read("app/web/distribution.json"))["ui_sha256"]\nexpected=json.load(open(sys.argv[2]))["dist_sha256"]\nassert actual == expected, "Packaged UI differs from the audited module closure"',
    path.join(resources, 'core', runtime.coreWheel), closureFile,
  ], { stdio: 'inherit' });
}
assert.ok(!JSON.stringify(accountConfig).includes('sk_live_') && !JSON.stringify(accountConfig).includes('sk_test_'),'Service secret must not enter the app');
console.log(JSON.stringify({result:'pass',platform:process.platform,arch:process.arch,asar_sha256:hash(archive),runtime_profile:runtime.deployment_profile,apache_notices:true,internal_files_excluded:true,signing:'not qualified'},null,2));
