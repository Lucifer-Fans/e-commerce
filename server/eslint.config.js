const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'src/assets/**'] },

  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      // Unused args are common in Express middleware signatures — `(err, req, res, next)`
      // needs all four to be recognised as an error handler even if one is unused.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$|^req$|^res$', varsIgnorePattern: '^_' }],

      // The logger is the intended output path; bare console.log is not.
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',

      // Catches `await` inside a non-async function and similar real mistakes.
      'require-atomic-updates': 'warn',
    },
  },
];
