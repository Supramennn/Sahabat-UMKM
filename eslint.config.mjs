import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // next-env.d.ts ditulis ulang oleh Next.js setiap build, jadi tidak boleh
    // ditimpa aturan lint.
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.tmp/**',
      '**/dist/**',
      '**/coverage/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Service worker berjalan di lingkup peramban, bukan di Node maupun di
    // TypeScript, jadi lingkungan globalnya dideklarasikan di sini.
    files: ['**/public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
)
