// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': 'error', // use the pino logger, never console
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    // Test files may use console and looser typing.
    files: ['**/*.test.ts', '**/tests/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Command-line tools in apps/*/scripts print for a human at a terminal.
    // The pino logger would wrap a formatted table in JSON and ruin it, so
    // `console` is the correct output channel here and only here.
    files: ['apps/*/scripts/**/*.mts', 'apps/*/scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
)
