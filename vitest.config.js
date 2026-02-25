import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['logic_test/**/*.test.mjs'],
        environment: 'node',
    },
})
