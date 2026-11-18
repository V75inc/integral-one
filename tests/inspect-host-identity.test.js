"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),asar=require('@electron/asar');
const {verifyPackagedHost}=require('../scripts/inspect-host-identity');
async function fixture(t,alter=()=>{}){const root=fs.mkdtempSync(path.join(os.tmpdir(),'one-package-identity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const write=(name,value)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
 const product={version:'0.1.14',dependencies:{'@integral/desktop-host':'file:vendor/host17.tgz'}},pins={product_version:'0.1.14',desktop_host:{version:'0.1.7-dev.17'}};
 write('package.json',JSON.stringify(product));write('distribution.json',JSON.stringify(pins));write('packages/desktop-host/lib/host.js','reviewed source');
 write('packed/package.json',JSON.stringify(product));write('packed/distribution.json',JSON.stringify(pins));write('packed/node_modules/@integral/desktop-host/package.json',JSON.stringify({version:'0.1.7-dev.17'}));write('packed/node_modules/@integral/desktop-host/lib/host.js','reviewed source');alter(write);
 const archive=path.join(root,'app.asar');await asar.createPackage(path.join(root,'packed'),archive);return{root,archive};}
 test('package inspection binds One version, distribution and actual host code',async t=>{const f=await fixture(t);assert.equal(verifyPackagedHost(f.root,f.archive).files,1);});
 for(const [label,alter]of [['host',write=>write('packed/node_modules/@integral/desktop-host/lib/host.js','changed code')],['version',write=>write('packed/package.json',JSON.stringify({version:'0.1.13',dependencies:{}}))],['extra',write=>write('packed/node_modules/@integral/desktop-host/lib/extra.js','unreviewed')]])test('package inspection rejects '+label+' drift',async t=>{const f=await fixture(t,alter);assert.throws(()=>verifyPackagedHost(f.root,f.archive));});
