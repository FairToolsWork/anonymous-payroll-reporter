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
                    if (id.includes('pdfjs-dist')) {
                        return 'pdfjs'
                    }
                    if (id.includes('/pwa/js/pdf/')) {
                        return 'pdf'
                    }
                    if (id.includes('/pwa/js/report/')) {
                        return 'report'
                    }
                    if (id.includes('/pwa/js/parse/')) {
                        return 'parse'
                    }
                    if (id.includes('/node_modules/xlsx')) {
                        return 'xlsx'
                    }
                    return null
                },
            },
        },
    },
})
