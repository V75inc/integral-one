"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {mountUpdateIndicator}=require("../frontend/host/update-indicator");
test("sidebar status survives sidebar replacement and requests the trusted update flow without installing",async()=>{
 let change,mutation,checks=0,unsubscribed=false;
 const rail=()=>({children:[],appendChild(node){this.children.push(node);node.parentNode=this;}});
 let current=rail();
 class Observer{constructor(fn){mutation=fn;}observe(){}disconnect(){}}
 const document={body:{},defaultView:{MutationObserver:Observer},querySelector:selector=>selector==='.system-bar-sidebar'?current:current.children.find(node=>node.className==='one-update-indicator'),createElement:()=>({style:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},addEventListener(_name,fn){this.click=fn;},remove(){this.removed=true;}})};
 const cleanup=mountUpdateIndicator(document,{getState:async()=>({status:"available",version:"0.1.1rc63"}),onChange:fn=>{change=fn;return()=>{unsubscribed=true;}},check:async()=>{checks++;}});
 await new Promise(resolve=>setImmediate(resolve));let button=current.children[0];assert.equal(button.hidden,false);assert.match(button.textContent,/Update available/);assert.equal(checks,0);
 current=rail();mutation();assert.equal(current.children[0],button);
 change({status:"ready",version:"0.1.1rc63"});assert.match(button.textContent,/Restart to update/);
 button.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(checks,1);assert.equal(button.disabled,false);
 change({status:"assisted",version:"0.1.1rc63"});assert.match(button.textContent,/Assisted update/);
 change({status:"compatibility",version:"0.1.1rc64"});assert.match(button.textContent,/awaiting compatibility/);
 change({status:"current"});assert.equal(button.hidden,true);
 cleanup();assert.equal(unsubscribed,true);assert.equal(button.removed,true);
});
test("an older initial status cannot replace a newer pushed state",async()=>{
 let change,resolve;
 const initial=new Promise(done=>{resolve=done;});
 const rail={appendChild(node){this.button=node;node.parentNode=this;}};
 const document={body:{},querySelector:selector=>selector==='.system-bar-sidebar'?rail:rail.button,createElement:()=>({style:{},setAttribute(){},addEventListener(){},remove(){}})};
 const cleanup=mountUpdateIndicator(document,{getState:()=>initial,onChange:fn=>{change=fn;return()=>{};},check:async()=>{}});
 change({status:'ready',version:'0.1.1rc63'});resolve({status:'available',version:'0.1.1rc63'});
 await new Promise(done=>setImmediate(done));assert.match(rail.button.textContent,/Restart to update/);cleanup();
});

test("status stays immediately above the expanded or collapsed account footer, including late footer mount",async()=>{
 let mutation,change;
 const rail={children:[],querySelectorAll(){return this.account?[this.account]:[];},insertBefore(node,anchor){
  if(node.parentNode){const old=node.parentNode.children;old.splice(old.indexOf(node),1);}
  this.children.splice(this.children.indexOf(anchor),0,node);node.parentNode=this;
 },appendChild(node){this.children.push(node);node.parentNode=this;}};
 const nav={parentNode:rail};rail.children.push(nav);
 class Observer{constructor(fn){mutation=fn;}observe(){}disconnect(){}}
 const document={body:{},defaultView:{MutationObserver:Observer},querySelector:selector=>selector==='.system-bar-sidebar'?rail:rail.children.find(n=>n.className==='one-update-indicator'),createElement(){const node={style:{},setAttribute(){},addEventListener(){},remove(){}};Object.defineProperty(node,'nextElementSibling',{get(){const siblings=this.parentNode?.children||[];return siblings[siblings.indexOf(this)+1]||null;}});return node;}};
 const cleanup=mountUpdateIndicator(document,{getState:async()=>({status:'available'}),onChange:fn=>{change=fn;return()=>{};},check:async()=>{}});await new Promise(done=>setImmediate(done));const button=rail.children[1];
 for(const label of ['Fixture person person@example.com menu','Fixture person menu']){
  const footer={parentNode:rail},wrapper={parentNode:footer};rail.account={parentNode:wrapper,ariaLabel:label};rail.children.push(footer);mutation();assert.equal(rail.children.at(-2),button);assert.equal(rail.children.at(-1),footer);
  change({status:'ready'});assert.equal(button.nextElementSibling,footer);rail.children.pop();
 }
 cleanup();
});
