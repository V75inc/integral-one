"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
test("a losing desktop copy never constructs the protocol controller before the product lock",async()=>{
 const trace=[];let options;
 const fake={
  "electron":{app:{isPackaged:false},protocol:{registerSchemesAsPrivileged(){}},net:{fetch(){throw Error("network forbidden");}}},
  "./accounts/config":{loadConfig:()=>({configured:true})},
  "./accounts/controller":{createController:()=>{trace.push("controller");return {beforeBoot:async()=>trace.push("account-boot"),accountProfile(){},authorizeSession(){}};}},
  "./accounts/local-profile":{createProfileInitializer:()=>async()=>{}},
  "./runtime-updates/manager":{createRuntimeManager:()=>({beforeBoot:async()=>trace.push("runtime-boot")})},
  "./update-center":{createUpdateCenter:()=>({progress(){}})},
  "./updates":{createUpdates:()=>({menuItems:[],start(){},check(){}})},
  "@integral/desktop-host":{runDesktop:value=>{options=value;return {};}}
 };
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../desktop/main.js"),"utf8"),{module,__dirname:path.join(__dirname,"../desktop"),process:{env:{}},console,require:id=>id in fake?fake[id]:id==='electron-updater'?{autoUpdater:{}}:id==='node:fs'?{...fs,existsSync:()=>true}:id.startsWith('../')?require(path.join(__dirname,'../desktop',id)):require(id)});
 assert.deepEqual(trace,[]);assert.equal(options.singleInstanceDataName,"Integral");
 await options.beforeBoot({userData:"/fixture"});assert.deepEqual(trace,["controller","account-boot","runtime-boot"]);
});
