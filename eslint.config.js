'use strict';

module.exports = [
  {
    files: ['src/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        setImmediate: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-shadow-restricted-names': 'error',
      'no-undef': 'error',
      'no-return-await': 'off',
      'no-console': 'off',
      'no-underscore-dangle': 'off',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
];
