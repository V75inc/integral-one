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
