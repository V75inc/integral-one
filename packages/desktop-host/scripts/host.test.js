'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

test('remote host starts no local runtime and exposes no local preload or session IPC', async () => {
  const loaded = [];
  const windows = [];
  const app = new EventEmitter();
  app.setName = () => {};
  app.commandLine = { hasSwitch: () => true };
  app.getPath = () => '/tmp/not-created';
  app.requestSingleInstanceLock = () => true;
  app.quit = () => {};
  let boot;
  let iconsStarted = false;
  app.whenReady = () => ({ then: callback => { boot = callback; return { catch: () => {} }; } });
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; windows.push(this);
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = callback => { this.popup = callback; };
    }
    async loadURL(url) { this.url = url; }
  }
  const electron = {
    app, BrowserWindow: Window, Menu: {buildFromTemplate: x => x, setApplicationMenu: () => {}},
    session: {defaultSession:{}}, dialog: {}, shell: {}, systemPreferences: {}, nativeTheme: {}, nativeImage: {},
    ipcMain: {handle: () => assert.fail('Remote host must never register local session IPC')},
  };
  const module = {exports: {}};
  const context = {module, __dirname:path.join(__dirname,'../lib'), process:{argv:['electron','main','--workspace-url=https://business.example'],env:{},platform:'linux'}, URL,
    require: id => {
      loaded.push(id);
      if (id === 'electron') return electron;
      if (id === './core-runtime' || id === './local-session') assert.fail('Remote imported local authority');
      if (id === './permissions') return {createPermissions: () => ({})};
      if (id === './theme-icons') return {createThemeIcons: () => ({start:()=>{ iconsStarted = true; },current:()=>null})};
      if (id === 'node:fs') return {mkdirSync:()=>{},chmodSync:()=>{}};
      return require(id.startsWith('./') ? path.join(__dirname,'../lib',id) : id);
    }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/host.js'),'utf8'),context);
  let onboarded = false;
  module.exports.runDesktop({mode:'remote',productName:'Test Business', beforeBoot: async ({userData}) => {
    assert.equal(iconsStarted, true, 'System icon must follow the theme before onboarding');
    assert.equal(windows.length, 0);
    assert.equal(userData, '/tmp/not-created');
    onboarded = true;
  }});
  await boot();
  assert.equal(onboarded, true);
  assert.equal(windows.length,1);
  assert.equal(windows[0].url,'https://business.example');
  assert.equal(windows[0].options.webPreferences.preload,undefined);
  assert.equal(windows[0].options.webPreferences.sandbox,true);
  assert.equal(loaded.includes('./core-runtime'),false);
  const event = {preventDefault:()=>{event.blocked=true;}};
  windows[0].webContents.emit('will-attach-webview',event);
  assert.equal(event.blocked,true);
});

async function localFixture({owned = true, stop = async () => ({state:'stopped'})} = {}) {
  const app = new EventEmitter(), stops = [], menus = [];
  let boot, quit = 0, ready = 0;
  Object.assign(app, {setName(){}, commandLine:{hasSwitch:()=>true}, getPath:()=>'/task/one',
    requestSingleInstanceLock:()=>true, quit:()=>{quit++;},
    whenReady:()=>({then:fn=>{boot=fn;return {catch(){}};}})});
  class Window extends EventEmitter {
    constructor() { super(); this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler=()=>{}; }
    async loadURL() {} close() {} setTitle() {}
  }
  const electron = {app, BrowserWindow:Window,
    Menu:{buildFromTemplate:x=>x,setApplicationMenu:x=>menus.push(x)},
    dialog:{showErrorBox(){}}, shell:{}, session:{defaultSession:{clearCache:async()=>{}}},
    ipcMain:{handle(){}}, systemPreferences:{}, nativeTheme:{}, nativeImage:{}};
  const runtime = {owned,pid:123,process_created:456,home:'/task/home',cli:{file:'integral',args:[]},web_url:'http://127.0.0.1:19006'};
  const module = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/host.js'),'utf8'), {
    module, __dirname:path.join(__dirname,'../lib'), URL,
    process:{argv:['electron','main'],env:{},platform:'darwin'},
    require:id=>{
      if(id==='electron')return electron;
      if(id==='node:fs')return {mkdirSync(){},chmodSync(){}};
      if(id==='./core-runtime')return {startCore:async()=>runtime,runCli:async (cli,args)=>{stops.push({cli,args});return stop();}};
      if(id==='./theme-icons')return {createThemeIcons:()=>({start(){},current:()=>null})};
      if(id==='./permissions')return {createPermissions:()=>({})};
      return require(id.startsWith('./')?path.join(__dirname,'../lib',id):id);
    },
  });
  const control = module.exports.runDesktop({mode:'local',helpMenuItems:[{label:'Check for Updates…'}],onReady:()=>{ready++;}});
  await boot();
  return {control,app,runtime,stops,menus,ready,quit:()=>quit};
}

test('update preparation serializes a confirmed owned-engine shutdown and exposes a native menu', async () => {
  let finish;
  const f = await localFixture({stop:()=>new Promise(resolve=>{finish=resolve;})});
  const a=f.control.stopRuntime({requireExclusive:true}), b=f.control.stopRuntime({requireExclusive:true});
  assert.equal(f.stops.length,1);
  assert.equal(f.ready,1);
  assert.equal(f.menus[0].at(-1).submenu[0].label,'Check for Updates…');
  assert.deepEqual(Array.from(f.stops[0].args),['stop','--home','/task/home','--json','--if-pid','123','--if-created','456']);
  finish({state:'stopped'}); await Promise.all([a,b]);
  assert.equal(f.runtime.owned,false);
  await f.control.stopRuntime({requireExclusive:true});
  assert.equal(f.stops.length,1);
});

test('updates cannot stop an externally owned runtime or treat a live status response as shutdown', async () => {
  const external=await localFixture({owned:false});
  await assert.rejects(external.control.stopRuntime({requireExclusive:true}),/Another process/);
  assert.equal(external.stops.length,0);
  const running=await localFixture({stop:async()=>({state:'ready'})});
  await assert.rejects(running.control.stopRuntime({requireExclusive:true}),/still running/);
  assert.equal(running.runtime.owned,true);
  let prevented=false;
  running.app.emit('before-quit',{preventDefault:()=>{prevented=true;}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(prevented,true);
  assert.equal(running.quit(),0);
});
