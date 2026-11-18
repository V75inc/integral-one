#!/usr/bin/env node
/** Synchronize local agent guides; never installs, publishes, deploys or activates. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const sdk = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await fs.readFile(path.join(sdk, 'package.json'), 'utf8'));
// Canonical text is UTF-8 with LF, including on autocrlf checkouts.
const guide = (await fs.readFile(path.join(sdk, 'APP_UI_GUIDE.md'), 'utf8')).replace(/\r\n/g, '\n');
const digest = createHash('sha256').update(guide).digest('hex');
const snapshot = `<!-- Generated Integral App UI guide; SDK ${pkg.version}; SHA-256 ${digest}. Do not edit. -->\n\n${guide}`;
const begin = '<!-- integral-app-ui:start -->', end = '<!-- integral-app-ui:end -->';
const args = process.argv.slice(2);
const value = name => {const i=args.indexOf(name); if(i<0)return null; if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`${name} requires a path`);return path.resolve(args[i+1]);};
const target = value('--target'), apps = value('--apps-root');
const check = args.includes('--check'), starter = args.includes('--starter');
if (!target && !apps) throw Error('Use --target <project> and/or --apps-root <App collection> [--check] [--starter].');
if (starter && (!target || apps)) throw Error('--starter requires one --target project.');
const allowed = new Set(['--target','--apps-root','--check','--starter']);
for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw Error(`Unknown option ${args[i]}`);if(['--target','--apps-root'].includes(args[i]))i++;}
const exists = async p => fs.access(p).then(()=>true,()=>false);
const roots = target ? [target] : [];
if (apps) for(const item of (await fs.readdir(apps,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
  if(item.isDirectory() && await exists(path.join(apps,item.name,'operational-model.yaml'))) roots.push(path.join(apps,item.name));
}
let changed = 0;
async function put(file, expected) {
 const current = await fs.readFile(file,'utf8').then(text => text.replace(/\r\n/g, '\n')).catch(e=>{if(e.code==='ENOENT')return '';throw e;});
 if(current===expected)return;
 changed++;
 if(check) {console.error(`STALE ${file}`);return;}
 await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,expected);
}
async function managed(file, body, cursor=false) {
 let text=await fs.readFile(file,'utf8').then(text => text.replace(/\r\n/g, '\n')).catch(e=>{if(e.code==='ENOENT')return '';throw e;});
 if(cursor) {
  if(text.startsWith('---\n')) {
   const close=text.indexOf('\n---',4);if(close<0)throw Error(`Invalid rule frontmatter: ${file}`);
   let header=text.slice(4,close);
   header=/^alwaysApply:/m.test(header)?header.replace(/^alwaysApply:.*$/m,'alwaysApply: true'):header+'\nalwaysApply: true';
   text='---\n'+header+text.slice(close);
  } else text='---\ndescription: Integral shared App UI contract\nalwaysApply: true\n---\n\n'+text;
 }
 const block=begin+'\n'+body+'\n'+end;
 const a=text.indexOf(begin), b=text.indexOf(end);
 if(text.split(begin).length>2||text.split(end).length>2)throw Error(`Duplicate managed instructions: ${file}`);
 if((a<0)!==(b<0)||b>=0&&b<a)throw Error(`Incomplete managed instructions: ${file}`);
 const next=a<0?text.trimEnd()+(text.trim()?'\n\n':'')+block+'\n':text.slice(0,a)+block+text.slice(b+end.length);
 await put(file,next);
}
for(const root of [...new Set(roots)]) {
 const guideFile=path.join(root,'APP_UI_GUIDE.md');
 const old=await fs.readFile(guideFile,'utf8').then(text => text.replace(/\r\n/g, '\n')).catch(e=>{if(e.code==='ENOENT')return '';throw e;});
 if(old && !old.startsWith('<!-- Generated Integral App UI guide;'))throw Error(`Refusing to replace handwritten guide: ${guideFile}`);
 await put(guideFile,snapshot);
 await managed(path.join(root,'AGENTS.md'),'## Shared App UI — automatic instructions\n\nBefore creating or changing App UI, read [APP_UI_GUIDE.md](APP_UI_GUIDE.md). Use Core\'s public React SDK patterns and host theme; keep domain behavior in the App.\nNew/migrated React components require SDK ^1.2.0 and design checks. Preserve\nexisting scoped instructions. Never treat UI work as permission to publish, deploy\nor activate a release.');
 await managed(path.join(root,'CLAUDE.md'),'@AGENTS.md\n@APP_UI_GUIDE.md');
 await managed(path.join(root,'.cursor/rules/app-ui.mdc'),'Read @AGENTS.md and @APP_UI_GUIDE.md before any App UI work. Follow the public\nCore SDK, shared host theme and migration/checklist in that local guide. These\ninstructions apply without a manually named skill or an explicit user reminder.',true);
 if(starter) {
  const example=guide.match(/```tsx\n([\s\S]*?)\n```/)[1]+'\n';
  const source=path.join(root,'ui/src/App.tsx');
  if(!await exists(source))await put(source,example);
  const sources=path.join(root,'ui/app-ui.sources.json');
  if(!await exists(sources))await put(sources,JSON.stringify({record_editor: 'src/App.tsx'},null,2)+'\n');
  const fragment=path.join(root,'ui/manifest.fragment.yaml');
  if(!await exists(fragment))await put(fragment,'# Merge into the owning manifest after building the artifact.\napp:\n  ui_components:\n  - key: record_editor\n    entry: ui/REPLACE_WITH_BUILT_DIGEST.mjs\n    digest: REPLACE_WITH_SHA256\n    export_name: default\n    sdk_range: ^1.2.0\n    placements: [entry_compose, entry_detail]\n    props_schema: {type: object, additionalProperties: false}\n# Retain the existing contribution fallback_view and host Save lifecycle.\n');
 }
}
if(check&&changed){process.exitCode=1;console.error(`${changed} generated guide/instruction files need synchronization.`);}
else console.log(`App UI guides ${check?'verified':'synchronized'} for ${roots.length} projects (SDK ${pkg.version}, ${digest}).`);
