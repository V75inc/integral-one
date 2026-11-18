"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const digest=value=>crypto.createHash("sha256").update(value).digest("hex");
function verifyPackagedHost(root,archive,asar=require("@electron/asar")) {
 const product=JSON.parse(fs.readFileSync(path.join(root,"package.json"))),pins=JSON.parse(fs.readFileSync(path.join(root,"distribution.json")));
 const extract=name=>asar.extractFile(archive,path.join(...name.split('/')));
 const packed=JSON.parse(extract('package.json'));
 assert.equal(packed.version,product.version,'Packaged One version differs from source');
 assert.equal(pins.product_version,product.version,'One version metadata differs');
 assert.equal(packed.dependencies['@integral/desktop-host'],product.dependencies['@integral/desktop-host'],'Packaged host dependency differs');
 assert.equal(digest(extract('distribution.json')),digest(fs.readFileSync(path.join(root,'distribution.json'))),'Packaged distribution differs');
 const base='node_modules/@integral/desktop-host/';
 assert.equal(JSON.parse(extract(base+'package.json')).version,pins.desktop_host.version,'Packaged host version differs');
 const source=path.join(root,'packages/desktop-host/lib'),expected=new Set();
 function visit(dir,prefix='') {for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
  assert.ok(!entry.isSymbolicLink(),'Host source links are forbidden');const name=prefix+entry.name;
  if(entry.isDirectory())visit(path.join(dir,entry.name),name+'/');else {assert.ok(entry.isFile());expected.add(base+'lib/'+name);assert.equal(digest(extract(base+'lib/'+name)),digest(fs.readFileSync(path.join(dir,entry.name))),'Packaged host code differs: '+name);}
 }}
 visit(source);
 for(const member of asar.listPackage(archive)) {
  const name=member.replaceAll('\\','/').replace(/^\//,'');
  if(name.startsWith(base+'lib/')&&!asar.statFile(archive,path.join(...name.split('/'))).files)assert.ok(expected.has(name),'Unreviewed host code in package');
 }
 return {one:product.version,host:pins.desktop_host.version,files:expected.size};
}
module.exports={verifyPackagedHost};
