import { defineConfig } from 'vite'

export default defineConfig({
    root: 'pwa',
    publicDir: 'public',
    define: {
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: false,
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    },
    resolve: {
        alias: {
            vue: 'vue/dist/vue.esm-bundler.js',
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        assetsDir: '',
        rollupOptions: {
            output: {
                entryFileNames: 'app.js',
                chunkFileNames: '[name].js',
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name?.endsWith('.css')) {
                        return 'styles.css'
                    }
                    return '[name][extname]'
                },
                manualChunks: (id) => {
                    const normId = id.replace(/\\/g, '/')
                    if (normId.includes('pdfjs-dist')) {
                        return 'pdfjs'
                    }
                    if (normId.includes('/pwa/src/pdf/')) {
                        return 'pdf'
                    }
                    if (normId.includes('/pwa/src/report/')) {
                        return 'report'
                    }
                    if (normId.includes('/pwa/src/parse/')) {
                        return 'parse'
                    }
                    if (normId.includes('/node_modules/xlsx')) {
                        return 'xlsx'
                    }
                    return null
                },
            },
        },
    },
})
