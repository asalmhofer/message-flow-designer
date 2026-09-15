import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['src/vendor/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-alert': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
