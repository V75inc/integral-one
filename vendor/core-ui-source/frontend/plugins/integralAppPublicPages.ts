import fs from 'node:fs';
import path from 'node:path';
import type { Connect } from 'vite';
import type { Plugin } from 'vite';

/** Root-level *.html from explicitly configured Integral app bundles. */
function discoverPublicRoots(cwd: string, envPaths: string): string[] {
  const fromEnv = envPaths
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => path.resolve(cwd, p));
  return [...new Set(fromEnv)];
}

function serveAppPublicHtml(roots: string[]): Connect.NextHandleFunction {
  return (req, res, next) => {
    const raw = (req.url || '/').split('?')[0];
    if (
      !raw ||
      raw === '/' ||
      raw.startsWith('/@') ||
      raw.startsWith('/api') ||
      raw.startsWith('/ws') ||
      raw.startsWith('/assets') ||
      raw.startsWith('/node_modules')
    ) {
      next();
      return;
    }
    const base = path.basename(raw);
    if (!base.endsWith('.html')) {
      next();
      return;
    }
    for (const root of roots) {
      const file = path.join(root, base);
      try {
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          fs.createReadStream(file).pipe(res);
          return;
        }
      } catch {
        /* try next root */
      }
    }
    next();
  };
}

/**
 * Dev/preview: serve bundle public pages before SPA fallback.
 * Set VITE_INTEGRAL_APP_PUBLIC_PATHS to comma-separated directories (each may contain *.html at root).
 * When unset, no app pages are served. Never inspect neighboring repositories.
 */
export function integralAppPublicPages(envPaths: string): Plugin {
  let roots: string[] = [];
  return {
    name: 'integral-app-public-pages',
    apply: 'serve',
    configResolved(config) {
      roots = discoverPublicRoots(config.root, envPaths);
      if (roots.length) {
        // eslint-disable-next-line no-console
        console.log(
          `[integral-app-public-pages] Serving *.html from: ${roots.join(', ')}`,
        );
      }
    },
    configureServer(server) {
      if (!roots.length) return;
      server.middlewares.use(serveAppPublicHtml(roots));
    },
    configurePreviewServer(server) {
      if (!roots.length) return;
      server.middlewares.use(serveAppPublicHtml(roots));
    },
  };
}
