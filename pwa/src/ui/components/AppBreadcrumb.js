import { defineComponent } from 'vue'

export const AppBreadcrumb = defineComponent({
    name: 'AppBreadcrumb',
    props: {
        current: {
            type: String,
            required: true,
        },
    },
    template: `
        <nav class="app-breadcrumb" aria-label="Breadcrumb">
            <a href="/index.html">Home</a>
            <span class="crumb-separator" aria-hidden="true">></span>
            <span aria-current="page">{{ current }}</span>
        </nav>
    `,
})
