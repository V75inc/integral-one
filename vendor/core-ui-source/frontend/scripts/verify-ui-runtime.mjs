/** Check the public production ABI after tree-shaking, not just TypeScript. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const expected = {
  react: ['createElement', 'createContext', 'useState', 'useEffect', 'useLayoutEffect', 'useRef'],
  jsx: ['jsx', 'jsxs', 'Fragment'],
  sdk: ['AppUIError', 'useAppUI', 'useAppQuery', 'useAppOperation', 'AppUIProvider', 'UIPrimitivesProvider', 'Button', 'Modal', 'EntryRegion', 'SDK_VERSION', 'useEntryDraft', 'useOptionalAppUI', 'AsyncCombobox', 'DateInput', 'AppPage', 'AppHeader', 'AppSection', 'AppGrid', 'AppField', 'AppActions', 'AppSummary', 'AppNotice', 'appTheme'],
};
for (const [entry, names] of Object.entries(expected)) {
  const module = await import(pathToFileURL(path.resolve(process.argv[2] || 'dist', `ui-runtime/${entry}.mjs`)).href);
  for (const name of names) assert.notEqual(module[name], undefined, `Production UI runtime ${entry} is missing ${name}`);
  if (entry === 'sdk') assert.equal(module.SDK_VERSION, JSON.parse(readFileSync(new URL('../../sdk/react/package.json', import.meta.url), 'utf8')).version, 'Production SDK version must match its public package contract');
  if (entry === 'react') assert.equal(module['module.exports'], module.default, 'CommonJS dependencies must receive the same React instance');
}
console.log('Production React, JSX and SDK exports: PASS');
