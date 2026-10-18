// ESLint flat config.
//
// Until this landed the repo had no ESLint at all — no config, no dependency,
// no script — while 18 source files carried `eslint-disable` comments for a
// linter that never ran. Those comments name the rules the codebase already
// expects to be enforced (`react-hooks/exhaustive-deps` x10, `no-console`,
// `no-constant-condition`, `@typescript-eslint/no-explicit-any`), so this
// config turns exactly those on rather than inventing a new house style.
//
// Deliberately NOT type-aware (no `projectService`): type-aware linting is a
// large step up in run time and would duplicate what `tsc --noEmit` already
// covers. Revisit if rules that need type information become worth the cost.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    // Build output, deps, and generated artifacts.
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'public/**',
      '*.config.js',
      '*.config.ts',
      'src/views/contracts.json',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser + standard timer globals. Kept explicit rather than pulling
        // in `globals` as another dependency for one small set.
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        AbortController: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        CustomEvent: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        MutationObserver: 'readonly',
        WebSocket: 'readonly',
        EventSource: 'readonly',
        crypto: 'readonly',
        structuredClone: 'readonly',
        queueMicrotask: 'readonly',
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Conditional / nested hooks are real bugs, not style. Clean at 3 sites,
      // all fixed when this config landed.
      'react-hooks/rules-of-hooks': 'error',

      // The rule that matters most here. The codebase has async effects
      // without cleanup guards where a stale response can overwrite newer
      // state; exhaustive-deps is the cheapest automated signal for that class.
      // 49 existing violations — warn so it is visible without blocking.
      'react-hooks/exhaustive-deps': 'warn',

      // eslint-plugin-react-hooks v7 ships the React-Compiler-era rules, which
      // are far stricter than the classic set this codebase was written
      // against. `set-state-in-effect` alone flags 136 sites, most of them the
      // ordinary "sync prop into state" pattern. Enforcing them here would mean
      // a 200-site refactor bundled into "add a linter", so they run as
      // warnings: visible, counted, and available as scoped follow-up work.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',

      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // `any` is widespread (224 occurrences at last count). Warn so it is
      // visible and does not grow, rather than erroring and forcing a large
      // unrelated refactor into this change.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Backlog drained to zero, so this gates as an error and cannot creep
      // back. Deliberately-unused bindings use the `_` prefix below.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // Console is used intentionally in a few places (and disabled inline in
      // three); keep warn/error/debug quiet and flag stray `console.log`.
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],

      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },

  {
    // Tests: relax the rules that fight fixtures and mocks.
    files: [
      '**/*.test.{ts,tsx}',
      '**/__tests__/**/*.{ts,tsx}',
      '**/setupTests.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      // Test doubles legitimately capture `this` to expose the instance to the
      // test (e.g. the FakeWebSocket in useEventStream.test.ts).
      '@typescript-eslint/no-this-alias': 'off',
    },
  },
);
