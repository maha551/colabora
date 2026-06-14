/**
 * ESLint flat config: TypeScript, React hooks, unused imports, design-system hex guard.
 */
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'unused-imports': unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,6}$/]',
          message:
            'Use design tokens instead of hardcoded hex colors. Use CSS variables (var(--color-name)) or design system constants.',
        },
      ],
    },
  },
  {
    ignores: ['build/**', 'dist/**', 'node_modules/**'],
  }
);
