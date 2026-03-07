import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.config.*', 'e2e/**'],
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // ─── React Hooks ─────────────────────────────────────────────────────────
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React hooks — enforce Rules of Hooks (used by every serious React shop)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/no-deriving-state-in-effects': 'warn',
      'react-hooks/use-memo': 'warn',

      // React Refresh — only export components from modules (Vite HMR)
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // ─── TypeScript strict rules (Vercel/Linear/Cal.com patterns) ────────────
  {
    rules: {
      // ── Type safety ──
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // ── Prevent common async mistakes ──
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // ── Safety nets ──
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/strict-boolean-expressions': 'off', // too noisy with JSX

      // ── Code clarity ──
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'], // PascalCase for React components
        },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',

      // ── Disabled (too noisy for React) ──
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // ── Core JS ──
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-alert': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'multi-line'],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*'],
              message: 'Prefer absolute imports using @/ alias over relative parent imports.',
            },
          ],
        },
      ],
    },
  },
  // ─── DDD Domain Boundaries ──────────────────────────────────────────────
  // shared/ must not import from domains/ or app/
  {
    files: ['src/shared/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/domains/**'], message: 'shared/ must not depend on any domain.' },
            { group: ['@/app/**'], message: 'shared/ must not depend on the app layer.' },
            { group: ['../*'], message: 'Use @/ alias for imports.' },
          ],
        },
      ],
    },
  },
  // domains/explore/ must not reach into other domains
  {
    files: ['src/domains/explore/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/domains/home/**'], message: 'Cross-domain import. Extract to @/shared/.' },
            { group: ['@/app/**'], message: 'Domains must not depend on the app layer.' },
            { group: ['../*'], message: 'Use @/ alias for imports.' },
          ],
        },
      ],
    },
  },
  // domains/home/ must not reach into other domains
  {
    files: ['src/domains/home/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/domains/explore/**'],
              message: 'Cross-domain import. Extract to @/shared/.',
            },
            { group: ['@/app/**'], message: 'Domains must not depend on the app layer.' },
            { group: ['../*'], message: 'Use @/ alias for imports.' },
          ],
        },
      ],
    },
  },
);
