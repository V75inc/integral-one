'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {verifyDistribution} = require('./verify-distribution');
const root = path.join(__dirname,'..');
verifyDistribution(root);
// Clear only the dedicated generated UI directory; never accept a user-supplied deletion target.
const base = path.join(root,'.build');
const output = path.join(base,'frontend');
if (fs.existsSync(base) && fs.lstatSync(base).isSymbolicLink()) throw new Error('Build root must not be a symlink.');
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('Build output must not be a symlink.');
fs.rmSync(output,{recursive:true,force:true});
execFileSync(process.env.PYTHON || 'python3',[
  path.join(root,'vendor/core-ui-source/compose.py'),'compose','--core',path.join(root,'vendor/core-ui-source'),
  '--output',output,'--product','integral-one','--overlay',path.join(root,'frontend/host'),
],{stdio:'inherit'});
// The inherited Core preview plugin otherwise discovers neighboring Business
// public pages. One's default preview must stay within its own build tree.
const publicRoot = path.join(output, '.one-public');
fs.mkdirSync(publicRoot);
fs.writeFileSync(path.join(output, '.env.local'), `VITE_INTEGRAL_APP_PUBLIC_PATHS=${JSON.stringify(publicRoot.split(path.sep).join('/'))}\n`);
