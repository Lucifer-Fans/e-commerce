import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },

  js.configs.recommended,

  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,

      /**
       * Only the two classic hook rules are enforced. eslint-plugin-react-hooks v7's
       * `recommended` preset also turns on the React Compiler rule set (purity,
       * set-state-in-effect, refs, …), which is an opt-in migration for an existing
       * codebase, not a CI gate. Adopt those deliberately — not by upgrading a plugin.
       */
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // This project does not use prop-types; types are not enforced at runtime.
      'react/prop-types': 'off',

      // Unused args are common in handler signatures — only flag them when they
      // are not deliberately placed (leading underscore opts out). ignoreRestSiblings
      // allows `const { password, ...rest } = obj` as a deliberate omit.
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],

      // Fast Refresh only works when a module exports components exclusively.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Build config and maintenance scripts run in Node, not the browser.
  {
    files: [
      '*.config.js',
      '*.config.mjs',
      'scripts/**/*.{js,mjs,cjs}',
      // Vite plugins are part of the build, so they run in Node too.
      'plugins/**/*.{js,mjs,cjs}',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // These are CLI tools — stdout is the entire point.
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
