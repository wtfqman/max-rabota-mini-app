import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error'
    }
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'apps/web/dist/**',
      'prisma/generated/**',
      'deploy/pm2/ecosystem.config.cjs',
      'scripts/rewrite-dist-package-imports.mjs'
    ]
  }
);
