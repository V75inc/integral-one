"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../desktop/workspace-preload-entry.js"),"utf8");
test("workspace preload mounts One status independently of Core UI and strips Electron events",async()=>{
 let loaded=0,mounted=0,ready,bridge,listener,removed=false;const calls=[];
 const document={location:{protocol:"http:"},readyState:"loading",addEventListener(name,fn,options){assert.equal(name,"DOMContentLoaded");assert.equal(options.once,true);ready=fn;}};
 const ipc={invoke:async name=>{calls.push(name);return {status:"ready"};},on(name,fn){assert.equal(name,"integral:updates-state");listener=fn;},removeListener(name,fn){assert.equal(fn,listener);removed=true;}};
 vm.runInNewContext(source,{process:{isMainFrame:true},document,require:id=>{
  if(id==="@integral/desktop-host/preload"){loaded++;return {};}
  if(id==="electron")return {ipcRenderer:ipc};
  if(id==="../frontend/host/update-indicator")return {mountUpdateIndicator(doc,b){assert.equal(doc,document);mounted++;bridge=b;}};
  assert.fail(id);
 }});
 assert.equal(loaded,1);assert.equal(mounted,0);ready();assert.equal(mounted,1);
 await bridge.getState();await bridge.check();assert.deepEqual(calls,["integral:updates-state","integral:updates-check"]);
 let value;const off=bridge.onChange(state=>{value=state;});listener({secret:"electron-event"},{status:"assisted"});assert.deepEqual(value,{status:"assisted"});off();assert.equal(removed,true);
});
test("subframes cannot expose the host bridge or mount the status affordance",()=>{
 vm.runInNewContext(source,{process:{isMainFrame:false},require(){assert.fail("Subframe must not import bridges");}});
});
test("the initial empty Electron document does not request update state", () => {
  vm.runInNewContext(source, {
    process: { isMainFrame: true },
    document: { location: { protocol: "about:" }, readyState: "complete" },
    require(id) {
      if (id === "@integral/desktop-host/preload") return {};
      if (id === "electron") return {};
      if (id === "../frontend/host/update-indicator") {
        return { mountUpdateIndicator() { assert.fail("Empty document mounted update state"); } };
      }
      assert.fail(id);
    },
  });
});
