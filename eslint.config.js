import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier/flat'

export default [
    {
        ignores: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    },
    js.configs.recommended,
    prettier,
    {
        files: ['**/*.{js,mjs,cjs,ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        plugins: {
            '@typescript-eslint': tseslint,
        },
        rules: {
            ...tseslint.configs.recommended.rules,
        },
    },
    {
        files: ['pwa/**/*.js'],
        languageOptions: {
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                sessionStorage: 'readonly',
                localStorage: 'readonly',
                URLSearchParams: 'readonly',
                Vue: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
            },
        },
    },
    {
        files: ['pwa/public/sw.js'],
        languageOptions: {
            globals: {
                self: 'readonly',
                caches: 'readonly',
                fetch: 'readonly',
            },
        },
    },
    {
        files: ['tests/utils/**/*.mjs'],
        languageOptions: {
            globals: {
                console: 'readonly',
            },
        },
    },
    {
        files: ['generate_fixtures/**/*.mjs'],
        languageOptions: {
            globals: {
                Buffer: 'readonly',
                URL: 'readonly',
                console: 'readonly',
                process: 'readonly',
            },
        },
    },
    {
        files: ['logic_test/**/*.mjs'],
        languageOptions: {
            globals: {
                process: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
        },
    },
    {
        files: ['pwa/js/report/build.js', 'pwa/js/parse/payroll.js'],
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
        },
    },
    {
        files: ['src/worker.js'],
        languageOptions: {
            globals: {
                URL: 'readonly',
                Headers: 'readonly',
                Response: 'readonly',
                Request: 'readonly',
                fetch: 'readonly',
                console: 'readonly',
            },
        },
    },
    {
        files: ['pwa/js/global.d.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            'no-undef': 'off',
        },
    },
]
