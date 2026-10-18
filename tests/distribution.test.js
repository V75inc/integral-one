'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {verifyDistribution,hash} = require('../scripts/verify-distribution');
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'one-contract-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const write=(name,value)=>{const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,value);};
  write('vendor/host.tgz','host');write('vendor/core.whl','wheel');write('vendor/core-ui-source/frontend/index.html','ui');
  const manifest={contract_version:1,files:{'frontend/index.html':hash(path.join(root,'vendor/core-ui-source/frontend/index.html'))}};
  write('vendor/core-ui-source/core-source.json',JSON.stringify(manifest));
  const pins={contract_version:1,product:'integral-one',mode:'local',desktop_host:{artifact:'vendor/host.tgz',sha256:hash(path.join(root,'vendor/host.tgz'))},core:{runtime_contract_version:1,runtime_preset:'local',base_wheel:'vendor/core.whl',wheel_sha256:hash(path.join(root,'vendor/core.whl')),ui_manifest_sha256:hash(path.join(root,'vendor/core-ui-source/core-source.json'))},data_compatibility:{app_id:'old.app',user_data_name:'Integral'},registration:{status:'planned',public_release_blocked_until_qualified:true}};
  write('distribution.json',JSON.stringify(pins));write('package.json',JSON.stringify({license:'Apache-2.0',build:{appId:'old.app'}}));
  for(const name of ['LICENSE','NOTICE','LICENSING.md'])write(name,'retained');
  return {root,write,pins};
}
test('actual distribution pins and retained Apache source verify',()=>assert.equal(verifyDistribution(path.join(__dirname,'..')).product,'integral-one'));
test('valid independent product fixture verifies',t=>assert.equal(verifyDistribution(fixture(t).root).mode,'local'));
for(const artifact of ['vendor/core.whl','vendor/host.tgz','vendor/core-ui-source/frontend/index.html']) test(`changed artifact denied: ${artifact}`,t=>{const f=fixture(t);f.write(artifact,'changed');assert.throws(()=>verifyDistribution(f.root));});
test('extra source files cannot bypass the source inventory',t=>{const f=fixture(t);f.write('vendor/core-ui-source/extra.js','unrecorded');assert.throws(()=>verifyDistribution(f.root),/Unrecorded/);});
test('path traversal cannot escape an artifact root',t=>{const f=fixture(t);f.pins.core.base_wheel='../outside.whl';f.write('distribution.json',JSON.stringify(f.pins));assert.throws(()=>verifyDistribution(f.root),/Invalid artifact path/);});
test('source directory symlinks are refused',t=>{const f=fixture(t);try{fs.symlinkSync(path.join(f.root,'vendor/core-ui-source/frontend'),path.join(f.root,'vendor/core-ui-source/linked'),'dir');}catch(error){if(error.code==='EPERM')return t.skip('OS symlink permission unavailable');throw error;}assert.throws(()=>verifyDistribution(f.root),/symlink/);});
test('app identity and account qualification cannot silently change',t=>{const f=fixture(t);f.pins.registration.status='implemented';f.write('distribution.json',JSON.stringify(f.pins));assert.throws(()=>verifyDistribution(f.root),/unqualified/);});

test('One refuses a hosted or missing runtime composition contract',t=>{const f=fixture(t);f.pins.core.runtime_preset='hosted';f.write('distribution.json',JSON.stringify(f.pins));assert.throws(()=>verifyDistribution(f.root),/neutral local runtime/);});
