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

async function localFixture({owned = true, stop = async () => ({state:'stopped'}), platform = 'darwin', windowsTitleBar = false, loadingScreen} = {}) {
  const app = new EventEmitter(), stops = [], menus = [], windows = [], handlers = {};
  let boot, quit = 0, ready = 0, builtMenu = null;
  Object.assign(app, {setName(){}, commandLine:{hasSwitch:()=>true}, getPath:()=>'/task/one',
    requestSingleInstanceLock:()=>true, quit:()=>{quit++;},
    whenReady:()=>({then:fn=>{boot=fn;return {catch(){}};}})});
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; windows.push(this);
      this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler=()=>{};
      this.webContents.send = (channel, value) => { this.fullscreenEvent = [channel, value]; };
    }
    async loadURL(url) { this.url = url; } close() {} setTitle() {}
    getContentSize() { return [1280, 800]; }
    setTitleBarOverlay(overlay) { this.overlay = overlay; }
    setBackgroundColor(color) { this.backgroundColor = color; }
    setFullScreen(value) {
      this.fullScreen = Boolean(value);
      this.emit(value ? 'enter-full-screen' : 'leave-full-screen');
    }
    isFullScreen() { return Boolean(this.fullScreen); }
  }
  const electron = {app, BrowserWindow:Window,
    Menu:{
      buildFromTemplate:x=>x,
      setApplicationMenu(menu) { builtMenu = menu; menus.push(menu); },
      getApplicationMenu() {
        return { getMenuItemById(id) {
          const item = builtMenu?.find(entry => entry.id === id);
          if (!item) return null;
          return { submenu: item.submenu ? { popup(options) { item.popped = options; } } : undefined };
        } };
      },
    },
    dialog:{showErrorBox(){}}, shell:{}, session:{defaultSession:{clearCache:async()=>{}}},
    ipcMain:{handle(channel, fn) { handlers[channel] = fn; }}, systemPreferences:{}, nativeTheme:{}, nativeImage:{}};
  const runtime = {owned,pid:123,process_created:456,home:'/task/home',cli:{file:'integral',args:[]},web_url:'http://127.0.0.1:19006'};
  const module = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/host.js'),'utf8'), {
    module, __dirname:path.join(__dirname,'../lib'), URL,
    process:{argv:['electron','main'],env:{},platform},
    require:id=>{
      if(id==='electron')return electron;
      if(id==='node:fs')return {mkdirSync(){},chmodSync(){}};
      if(id==='./core-runtime')return {startCore:async()=>runtime,runCli:async (cli,args)=>{stops.push({cli,args});return stop();}};
      if(id==='./theme-icons')return {createThemeIcons:()=>({start(){},current:()=>null})};
      if(id==='./permissions')return {createPermissions:()=>({})};
      return require(id.startsWith('./')?path.join(__dirname,'../lib',id):id);
    },
  });
  const control = module.exports.runDesktop({mode:'local',windowsTitleBar,loadingScreen,helpMenuItems:[{label:'Check for Updates…'}],onReady:()=>{ready++;}});
  await boot();
  return {control,app,runtime,stops,menus,windows,handlers,ready,quit:()=>quit};
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

function trustedEvent(win) {
  win.webContents.mainFrame = { url: 'http://127.0.0.1:19006/' };
  return { sender: win.webContents, senderFrame: win.webContents.mainFrame };
}

test('Windows title bar recolors the native caption and pops the installed menu', async () => {
  const f = await localFixture({ platform: 'win32', windowsTitleBar: true, loadingScreen: { backgroundColor: '#171717', title: 'Integral | one' } });
  const splash = f.windows[0];
  const main = f.windows[1];
  assert.equal(splash.options.titleBarStyle, 'hidden');
  assert.equal(splash.options.autoHideMenuBar, true);
  assert.equal(splash.options.backgroundColor, '#171717');
  assert.deepEqual(splash.options.titleBarOverlay, { color: '#171717', symbolColor: '#ededed', height: 32 });
  assert.equal(main.options.titleBarStyle, 'hidden');
  assert.equal(main.options.autoHideMenuBar, true);
  assert.equal(main.options.backgroundColor, '#1a1a1a');
  assert.deepEqual(main.options.titleBarOverlay, { color: '#1a1a1a', symbolColor: '#ededed', height: 32 });
  const argument = main.options.webPreferences.additionalArguments[0];
  const bar = f.menus[0].filter(item => item.id);
  assert.equal(Array.from(bar, item => item.id).join(','), 'file,edit,view,help');
  const edit = bar.find(item => item.id === 'edit');
  const editRoles = edit.submenu.map(item => item.role).filter(Boolean);
  assert.equal(Array.from(editRoles).join(','), 'undo,redo,cut,copy,paste,pasteAndMatchStyle,delete');
  assert.equal(edit.submenu.some(item => item.role === 'selectAll' || item.label === 'Settings'), false);
  const viewRoles = bar.find(item => item.id === 'view').submenu.map(item => item.role).filter(Boolean);
  assert.equal(Array.from(viewRoles).join(','), 'resetZoom,zoomIn,zoomOut');
  assert.equal(bar.some(item => item.role === 'windowMenu' || item.id === 'window'), false);
  assert.deepEqual(JSON.parse(argument.slice('--integral-window-chrome='.length)).menus.map(menu => menu.id),
    ['file', 'edit', 'view', 'help']);
  const event = trustedEvent(main);
  assert.equal(await f.handlers['integral:window-chrome-popup'](event, 'file', 12, 32), true);
  const popped = f.menus[0].find(item => item.id === 'file').popped;
  assert.equal(popped.window, main);
  assert.equal(popped.x, 12);
  assert.equal(popped.y, 32);
  assert.equal(await f.handlers['integral:window-chrome-popup'](event, 'tools', 12, 32), null);
  assert.equal(await f.handlers['integral:window-chrome-popup'](event, 'window', 12, 32), null);
  assert.equal(await f.handlers['integral:window-chrome-theme'](event, 'light'), '#fafafa');
  assert.deepEqual(main.overlay, { color: '#fafafa', symbolColor: '#0b0b0c', height: 32 });
  assert.equal(main.backgroundColor, '#fafafa');
  assert.equal(await f.handlers['integral:window-chrome-theme'](event, 'blue'), null);
  assert.equal(f.handlers['integral:window-chrome-fullscreen'], undefined);
  await assert.rejects(f.handlers['integral:window-chrome-popup']({ sender: {}, senderFrame: event.senderFrame }, 'file', 12, 32), /Untrusted/);
});

test('Mac and a framed Windows window keep the system title bar', async () => {
  const mac = await localFixture({ platform: 'darwin', windowsTitleBar: true });
  assert.equal(mac.windows[0].options.titleBarStyle, undefined);
  assert.equal(mac.windows.at(-1).options.titleBarStyle, undefined);
  assert.equal(mac.windows.at(-1).options.backgroundColor, '#ffffff');
  const macView = mac.menus[0].find(item => item.id === 'view');
  assert.equal(macView.submenu.some(item => item.role === 'togglefullscreen'), true);
  assert.equal(mac.handlers['integral:window-chrome-popup'], undefined);
  const framed = await localFixture({ platform: 'win32' });
  assert.equal(framed.windows[0].options.titleBarStyle, undefined);
  assert.equal(framed.windows.at(-1).options.titleBarStyle, undefined);
  assert.equal(framed.windows.at(-1).options.autoHideMenuBar, undefined);
  assert.equal(framed.handlers['integral:window-chrome-theme'], undefined);
});
