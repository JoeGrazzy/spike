import globals from 'globals';

export default [
  {
    files: ['js/**/*.js', 'js/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-constant-condition': 'warn',
      'no-debugger': 'error'
    }
  }
];
