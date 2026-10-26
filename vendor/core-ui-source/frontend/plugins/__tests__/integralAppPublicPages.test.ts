// @vitest-environment node
import { once } from 'node:events';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { integralAppPublicPages } from '../integralAppPublicPages';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'integral-public-pages-'));
  folders.push(root);
  return root;
}

function configure(plugin: Plugin, root: string) {
  const hook = plugin.configResolved;
  if (typeof hook !== 'function') throw new Error('Missing configuration hook');
  hook.call({} as never, { root } as ResolvedConfig);
}

function middleware(plugin: Plugin) {
  const use = vi.fn();
  const hook = plugin.configureServer;
  if (typeof hook !== 'function') throw new Error('Missing server hook');
  hook.call({} as never, { middlewares: { use } } as unknown as ViteDevServer);
  return use;
}

describe('explicit public App pages', () => {
  it('ignores neighboring repositories without explicit paths', () => {
    const root = temporaryRoot();
    const neighbor = path.join(root, 'integral-business/integral-apps/example/public');
    fs.mkdirSync(neighbor, { recursive: true });
    fs.writeFileSync(path.join(neighbor, 'example.html'), 'Unselected page');
    const plugin = integralAppPublicPages('');
    configure(plugin, path.join(root, 'integral-core/frontend'));
    expect(middleware(plugin)).not.toHaveBeenCalled();
    expect(plugin.apply).toBe('serve');
  });

  it('serves configured relative public pages and leaves API requests alone', async () => {
    const root = temporaryRoot();
    fs.mkdirSync(path.join(root, 'public-app'));
    fs.writeFileSync(path.join(root, 'public-app/example.html'), '<h1>Public App</h1>');
    const plugin = integralAppPublicPages('./public-app');
    configure(plugin, root);
    const use = middleware(plugin);
    expect(use).toHaveBeenCalledOnce();
    const handler = use.mock.calls[0][0];
    const next = vi.fn();
    handler({ url: '/api/health' }, {}, next);
    expect(next).toHaveBeenCalledOnce();
    const response = Object.assign(new PassThrough(), { statusCode: 0, setHeader: vi.fn() });
    let content = '';
    response.on('data', chunk => { content += chunk.toString(); });
    const complete = once(response, 'end');
    handler({ url: '/example.html' }, response, next);
    await complete;
    expect(content).toBe('<h1>Public App</h1>');
    expect(response.statusCode).toBe(200);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(plugin.apply).toBe('serve');
  });
});
