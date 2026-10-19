'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {runtimeDiagnostics} = require('../scripts/qualify-runtime');
function home(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'one-diagnostics-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  fs.mkdirSync(path.join(root, 'logs'));
  return root;
}
test('runtime diagnostics redact synthetic keys and connection credentials', t => {
  const root=home(t);
  fs.writeFileSync(path.join(root,'installation.json'), JSON.stringify({database_password:'synthetic-secret',control_token:'control-value',jwt_key:'jwt-value'}));
  fs.writeFileSync(path.join(root,'logs/database.log'), 'failure synthetic-secret control-value jwt-value postgresql://user:other-password@127.0.0.1/db');
  const output=runtimeDiagnostics(root);
  assert.match(output,/database.log/);
  for (const value of ['synthetic-secret','control-value','jwt-value','other-password']) assert.ok(!output.includes(value));
  assert.match(output,/redacted/);
});
test('runtime diagnostics refuse logs when the secret inventory is unavailable', t => {
  const root=home(t);
  fs.writeFileSync(path.join(root,'logs/database.log'),'private detail');
  assert.ok(!runtimeDiagnostics(root).includes('private detail'));
});
test('runtime diagnostics are bounded and only read named runtime logs', t => {
  const root=home(t);
  fs.writeFileSync(path.join(root,'installation.json'),'{}');
  fs.writeFileSync(path.join(root,'logs/database.log'),'x'.repeat(20000)+' final error');
  fs.writeFileSync(path.join(root,'logs/other.log'),'unrelated');
  const output=runtimeDiagnostics(root);
  assert.ok(output.length<6200);
  assert.match(output,/final error/);
  assert.ok(!output.includes('unrelated'));
});
