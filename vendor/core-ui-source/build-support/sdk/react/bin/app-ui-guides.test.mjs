import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const command = fileURLToPath(new URL('./app-ui-guides.mjs', import.meta.url));
test('standalone guides preserve instructions/source, check without writes and detect drift', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'integral-ui-guides-test-'));
  try {
    await fs.writeFile(path.join(root, 'AGENTS.md'), '# App-specific business rules\n');
    await fs.writeFile(path.join(root, 'CLAUDE.md'), '# Existing instructions\n');
    const run = (...args) => execFileSync(process.execPath, [command, '--target', root, '--starter', ...args]);
    run();
    for (const name of ['AGENTS.md', 'CLAUDE.md', 'APP_UI_GUIDE.md', '.cursor/rules/app-ui.mdc', 'ui/src/App.tsx', 'ui/manifest.fragment.yaml', 'ui/app-ui.sources.json']) assert.ok((await fs.readFile(path.join(root, name), 'utf8')).length);
    const agents = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
    assert.ok(agents.startsWith('# App-specific business rules\n'));
    const claude = await fs.readFile(path.join(root, 'CLAUDE.md'), 'utf8');
    assert.ok(claude.startsWith('# Existing instructions\n'));
    assert.match(claude, /^@AGENTS.md$/m); assert.match(claude, /^@APP_UI_GUIDE.md$/m);
    run('--check');
    for (const name of ['AGENTS.md', 'CLAUDE.md', 'APP_UI_GUIDE.md', '.cursor/rules/app-ui.mdc']) {const file = path.join(root, name); await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace(/\n/g, '\r\n'));}
    run('--check');
    await fs.writeFile(path.join(root, 'ui/src/App.tsx'), '// domain work\n');
    run(); assert.equal(await fs.readFile(path.join(root, 'ui/src/App.tsx'), 'utf8'), '// domain work\n');
    const stale = path.join(root, 'APP_UI_GUIDE.md');
    await fs.appendFile(stale, '\nSTALE\n');
    const result = spawnSync(process.execPath, [command, '--target', root, '--check']);
    assert.notEqual(result.status, 0); assert.match(await fs.readFile(stale, 'utf8'), /STALE/);
    run(); run('--check');
    assert.equal((await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8')).replace(/\r\n/g, '\n'), agents);
  } finally {await fs.rm(root, {recursive: true, force: true});}
});

test('refuses to overwrite a handwritten guide or malformed instruction blocks', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'integral-ui-guide-preserve-'));
  try {
    const file = path.join(root, 'APP_UI_GUIDE.md');
    await fs.writeFile(file, '# Handwritten App notes\n');
    let run = spawnSync(process.execPath, [command, '--target', root]);
    assert.notEqual(run.status, 0);
    assert.equal(await fs.readFile(file, 'utf8'), '# Handwritten App notes\n');
    await fs.unlink(file);
    const malformed = '<!-- integral-app-ui:start -->\nApp rules without a closing marker\n';
    await fs.writeFile(path.join(root, 'AGENTS.md'), malformed);
    run = spawnSync(process.execPath, [command, '--target', root]);
    assert.notEqual(run.status, 0);
    assert.equal(await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8'), malformed);
  } finally {await fs.rm(root, {recursive:true,force:true});}
});
