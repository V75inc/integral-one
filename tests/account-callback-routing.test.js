'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{EventEmitter}=require('node:events'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../desktop/accounts/controller.js'),'utf8');
let sequence=0;const exchanges=[];
function instance(profile){
 const handlers=new Map(),windows=[],app=new EventEmitter();let state={installationId:profile};let protocolRegistered=0;
 app.setAsDefaultProtocolClient=()=>protocolRegistered++;app.quit=()=>{};
 class Window extends EventEmitter{constructor(){super();this.webContents=new EventEmitter();this.webContents.mainFrame={url:'integral-one://account/'};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=()=>{};windows.push(this);}loadURL(){return Promise.resolve();}isDestroyed(){return false;}isMinimized(){return false;}show(){}focus(){}close(){this.emit('closed');}}
 const module={exports:{}};const auth={createAttempt:()=>({state:'synthetic-state-'+(++sequence)}),authorizationUrl:(_id,attempt)=>'https://example.invalid/?state='+attempt.state,saveLogtoSetup:async(_home,_state,proof)=>{exchanges.push({profile,state:proof.attempt.state});state={...state,localSetup:true};},verifyLogtoSetup:()=>({}),LINKED_ACCOUNT:'fixture'};
 const requireFake=id=>id==='./receipt'?{loadState:()=>state,privateFile(){}}:id==='./logto-setup'?auth:require(id);
 vm.runInNewContext(source,{require:requireFake,module,exports:module.exports,process:{argv:[],env:{},platform:'darwin'},URL,Buffer,Response,AbortSignal,console,__dirname:'/fixture'}, {filename:'controller.js'});
 let authUrl;
 const controller=module.exports.createController({electron:{app,BrowserWindow:Window,ipcMain:{handle:(k,v)=>handlers.set(k,v),removeHandler:k=>handlers.delete(k)},shell:{openExternal:async url=>{authUrl=url;}},session:{fromPartition:()=>({setPermissionRequestHandler(){},setPermissionCheckHandler(){},protocol:{handle(){}}})}},config:{configured:true,appId:'fixture'},request:async()=>{throw Error('unexpected network')}});
 const gate=controller.beforeBoot({userData:'/isolated/'+profile});
 const start=async()=>{const win=windows[0];await handlers.get('integral-one:account-start')({sender:win.webContents,senderFrame:win.webContents.mainFrame});return new URL(authUrl).searchParams.get('state');};
 return {app,controller,gate,start,protocolRegistered:()=>protocolRegistered};
}
require('node:test')('callbacks routed to another profile cannot exchange its sign-in state',async()=>{const a=instance('profile-a'),b=instance('profile-b');const sa=await a.start(),sb=await b.start();assert.notEqual(sa,sb);b.app.emit('open-url',{preventDefault(){}},'integral-one://account/callback?code=synthetic&state='+sa);await new Promise(r=>setImmediate(r));assert.equal(exchanges.length,0);a.app.emit('open-url',{preventDefault(){}},'integral-one://account/callback?code=synthetic&state='+sa);await a.gate;assert.equal(exchanges.length,1);assert.equal(exchanges[0].profile,'profile-a');b.controller.cleanup();a.controller.cleanup();assert.equal(a.protocolRegistered(),1);assert.equal(b.protocolRegistered(),1);});
